import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const recipient = "shivapandey232000@gmail.com";
const approvalText = "I confirm this enquiry is accurate and approve the submitted information for review. This approval is not a service or investment agreement.";

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>\"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const respond = (body: Record<string, unknown>, status = 200) => new Response(
    JSON.stringify(body),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
  if (request.method !== "POST") return respond({ error: "Method not allowed." }, 405);

  const authorization = request.headers.get("Authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const url = Deno.env.get("SUPABASE_URL");
  const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
  const publishableKey = publishableKeys.default || Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL") || "Dwarka Management <onboarding@resend.dev>";
  if (!token || !url || !publishableKey || !serviceKey || !resendKey) {
    return respond({ error: "Email delivery is not configured. Your enquiry may have been saved; please contact us directly." }, 503);
  }

  try {
    const authClient = createClient(url, publishableKey, { auth: { persistSession: false } });
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user || user.is_anonymous !== true) return respond({ error: "The form session could not be verified." }, 401);

    const { submissionId } = await request.json();
    if (typeof submissionId !== "string" || !/^[0-9a-f-]{36}$/i.test(submissionId)) {
      return respond({ error: "Invalid enquiry reference." }, 400);
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: row, error: rowError } = await admin.from("contact_submissions")
      .select("id,owner_id,name,email,phone,company,message,document_consent,document_paths,approval_kind,approval_name,approval_path,approval_text,created_at,email_delivery_status")
      .eq("id", submissionId).maybeSingle();
    if (rowError) {
      // Keep database/configuration failures distinguishable from a genuinely missing
      // row. Returning 404 for both obscures broken service credentials and schema issues.
      console.error("Submission lookup failed", { code: rowError.code || "unknown" });
      return respond({ error: "The saved enquiry could not be checked. It remains saved; please contact us directly." }, 500);
    }
    if (!row) return respond({ error: "The enquiry could not be found." }, 404);
    // The service client can read any submission, so enforce the caller ownership
    // check explicitly before reading attachments or sending any of its details.
    if (row.owner_id !== user.id) {
      console.warn("Submission owner mismatch", { submissionId });
      return respond({ error: "The enquiry could not be found." }, 404);
    }
    if (row.email_delivery_status === "sent") return respond({ ok: true, alreadySent: true });
    if (row.approval_text !== approvalText || !Array.isArray(row.document_paths)) {
      return respond({ error: "The enquiry data could not be validated." }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
      return respond({ error: "The enquiry email address is invalid." }, 400);
    }

    const files: Array<{ filename: string; content: string; content_type: string }> = [];
    const totalAttachments = [...row.document_paths];
    if (row.approval_kind === "drawn" && row.approval_path) {
      totalAttachments.push({ kind: "approval-signature", path: row.approval_path, contentType: "image/png", sizeBytes: 0 });
    }
    let totalBytes = 0;
    for (const item of totalAttachments) {
      if (!item || typeof item.path !== "string" || !item.path.startsWith(`${user.id}/${submissionId}/`)) {
        return respond({ error: "An uploaded file could not be validated." }, 400);
      }
      const { data: blob, error: fileError } = await admin.storage.from("contact-documents").download(item.path);
      if (fileError || !blob) return respond({ error: "An uploaded file could not be retrieved. The enquiry remains saved." }, 502);
      totalBytes += blob.size;
      if (totalBytes > 14 * 1024 * 1024) return respond({ error: "The uploaded files exceed the email size limit. The enquiry remains saved." }, 413);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
      }
      const ext = item.path.split(".").pop()?.toLowerCase() || "bin";
      const label = item.kind === "legal-document" ? "legal-document" : item.kind;
      files.push({ filename: `${label}-${files.length + 1}.${ext}`, content: btoa(binary), content_type: item.contentType || blob.type || "application/octet-stream" });
    }

    const approval = row.approval_kind === "drawn"
      ? "Drawn signature attached"
      : `Typed approval: ${row.approval_name}`;
    const fields: Array<[string, unknown]> = [
      ["Name", row.name], ["Email", row.email], ["Phone", row.phone],
      ["Company", row.company || "Not provided"], ["Message", row.message],
      ["Submitted", row.created_at], ["Document consent", row.document_consent ? "Yes" : "No"],
      ["Approval", approval], ["Approval wording", row.approval_text],
      ["Enquiry reference", row.id],
    ];
    const html = `<h2>New Dwarka Management enquiry</h2><table>${fields.map(([label, value]) => `<tr><th align="left" valign="top">${escapeHtml(label)}</th><td>${escapeHtml(value).replace(/\n/g, "<br>")}</td></tr>`).join("")}</table><p>${files.length} file(s) attached.</p>`;
    const plain = fields.map(([label, value]) => `${label}: ${String(value ?? "")}`).join("\n") + `\n\n${files.length} file(s) attached.`;
    const mailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json", "Idempotency-Key": `contact-submission-${row.id}` },
      body: JSON.stringify({
        from, to: [recipient], reply_to: row.email,
        subject: `New enquiry from ${String(row.name).replace(/[\r\n]+/g, " ").slice(0, 120)}`,
        html, text: plain, attachments: files,
      }),
    });
    const mailResult = await mailResponse.json().catch(() => ({}));
    if (!mailResponse.ok || !mailResult.id) {
      await admin.from("contact_submissions").update({ email_delivery_status: "failed" }).eq("id", row.id);
      console.error("Resend send failed", { status: mailResponse.status, code: mailResult?.name || mailResult?.error?.name || "unknown" });
      return respond({ error: "The enquiry was saved, but the email could not be sent. Please contact us directly." }, 502);
    }

    const { error: updateError } = await admin.from("contact_submissions")
      .update({ email_delivery_status: "sent", email_delivery_id: mailResult.id }).eq("id", row.id);
    if (updateError) console.error("Email status update failed", { code: updateError.code });
    return respond({ ok: true });
  } catch (error) {
    console.error("Contact email function failed", error instanceof Error ? error.message : "unknown error");
    return respond({ error: "The enquiry may be saved, but its email could not be confirmed. Please contact us directly." }, 500);
  }
});
