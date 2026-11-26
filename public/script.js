document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("contactModal");
  const form = document.getElementById("contactForm");
  const status = document.getElementById("formStatus");
  const title = document.getElementById("contactModalTitle");
  const description = title?.nextElementSibling;
  const submitButton = document.getElementById("submitContactButton");
  const legalDocumentsInput = document.getElementById("legalDocuments");
  const idFrontInput = document.getElementById("idFront");
  const idBackInput = document.getElementById("idBack");
  const documentConsent = document.getElementById("documentConsent");
  const documentConsentLabel = document.getElementById("documentConsentLabel");
  const signatureCanvas = document.getElementById("approvalSignature");
  const signaturePlaceholder = document.getElementById("signaturePlaceholder");
  const typedSignature = document.getElementById("typedSignature");
  const clearSignatureButton = document.getElementById("clearSignature");
  const signatureContext = signatureCanvas?.getContext("2d");
  let signatureHasInk = false;
  let signatureDrawing = false;
  const supabaseConfig = window.DWARKA_SUPABASE_CONFIG || {};
  const supabaseClient = window.supabase?.createClient && supabaseConfig.url && supabaseConfig.publishableKey
    ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }
    })
    : null;
  const documentBucket = "contact-documents";
  const approvalText = "I confirm this enquiry is accurate and approve the submitted information for review. This approval is not a service or investment agreement.";
  const approvalVersion = "contact-enquiry-approval-v1";

  const menuToggle = document.getElementById("menuToggle");
  const navLinks = document.getElementById("navLinks");

  const originalTitle = title?.textContent || "Start a conversation";
  const originalDescription =
    description?.textContent || "Tell us what you are building.";

  const selectedUploads = () => [
    ...(legalDocumentsInput ? Array.from(legalDocumentsInput.files || []) : []),
    ...(idFrontInput?.files?.[0] ? [idFrontInput.files[0]] : []),
    ...(idBackInput?.files?.[0] ? [idBackInput.files[0]] : [])
  ];

  const refreshUploadLabels = () => {
    const legalList = document.getElementById("legalDocumentsList");
    const frontList = document.getElementById("idFrontList");
    const backList = document.getElementById("idBackList");
    if (legalList) legalList.textContent = legalDocumentsInput?.files?.length
      ? Array.from(legalDocumentsInput.files).map((file) => file.name).join(", ")
      : "No files selected";
    if (frontList) frontList.textContent = idFrontInput?.files?.[0]?.name || "No file selected";
    if (backList) backList.textContent = idBackInput?.files?.[0]?.name || "No file selected";

    const hasUploads = selectedUploads().length > 0;
    if (documentConsent) documentConsent.required = hasUploads;
    if (documentConsentLabel) documentConsentLabel.hidden = !hasUploads;
  };

  const clearSignature = () => {
    if (signatureCanvas && signatureContext) {
      signatureContext.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
    }
    signatureHasInk = false;
    if (signaturePlaceholder) signaturePlaceholder.hidden = false;
  };

  const signaturePoint = (event) => {
    const bounds = signatureCanvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * (signatureCanvas.width / bounds.width),
      y: (event.clientY - bounds.top) * (signatureCanvas.height / bounds.height)
    };
  };

  signatureCanvas?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    signatureCanvas.setPointerCapture(event.pointerId);
    const point = signaturePoint(event);
    signatureContext.beginPath();
    signatureContext.moveTo(point.x, point.y);
    signatureDrawing = true;
    signatureHasInk = true;
    if (signaturePlaceholder) signaturePlaceholder.hidden = true;
    if (typedSignature) typedSignature.value = "";
  });

  signatureCanvas?.addEventListener("pointermove", (event) => {
    if (!signatureDrawing) return;
    const point = signaturePoint(event);
    signatureContext.lineWidth = 3;
    signatureContext.lineCap = "round";
    signatureContext.lineJoin = "round";
    signatureContext.strokeStyle = "#101d32";
    signatureContext.lineTo(point.x, point.y);
    signatureContext.stroke();
  });

  const stopSignature = () => { signatureDrawing = false; };
  signatureCanvas?.addEventListener("pointerup", stopSignature);
  signatureCanvas?.addEventListener("pointercancel", stopSignature);
  clearSignatureButton?.addEventListener("click", () => {
    clearSignature();
    if (typedSignature) typedSignature.value = "";
  });
  typedSignature?.addEventListener("input", () => {
    if (typedSignature.value.trim()) clearSignature();
  });
  [legalDocumentsInput, idFrontInput, idBackInput].forEach((input) => {
    input?.addEventListener("change", refreshUploadLabels);
  });

  /* -----------------------------
     Form status helper
  ----------------------------- */

  const setStatus = (message, type = "") => {
    if (!status) return;

    status.hidden = !message;
    status.textContent = message;
    status.className = `form-status ${type}`.trim();
  };

  /* -----------------------------
     Contact modal
  ----------------------------- */

  const openModal = () => {
    if (!modal) return;

    modal.hidden = false;
    modal.classList.add("is-open");
    document.body.classList.add("modal-open");

    form?.reset();
    clearSignature();
    refreshUploadLabels();

    if (title) title.textContent = originalTitle;
    if (description) description.textContent = originalDescription;

    if (form) {
      form.style.setProperty("display", "", "important");
    }

    setStatus("");

    window.setTimeout(() => {
      form?.querySelector("input")?.focus();
    }, 100);
  };

  const closeModal = () => {
    if (!modal) return;

    modal.classList.remove("is-open");
    modal.hidden = true;
    document.body.classList.remove("modal-open");
  };

  document
    .querySelectorAll(".js-open-contact, [data-contact-modal]")
    .forEach((button) => {
      button.addEventListener("click", (event) => {
        if (button.tagName === "A") {
          event.preventDefault();
        }

        openModal();
      });
    });

  document.querySelectorAll(".js-close-contact").forEach((button) => {
    button.addEventListener("click", closeModal);
  });

  modal?.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (modal && !modal.hidden) closeModal();
    else if (navLinks?.classList.contains("is-open")) {
      closeMobileMenu();
      menuToggle?.focus();
    }
  });

  const openModalFromHash = () => {
    if (window.location.hash === "#contact") {
      openModal();
    }
  };

  openModalFromHash();
  window.addEventListener("hashchange", openModalFromHash);
  /* -----------------------------
     Mobile navigation
  ----------------------------- */

  const closeMobileMenu = () => {
    if (!navLinks || !menuToggle) return;

    navLinks.classList.remove("is-open");
    menuToggle.classList.remove("is-active");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Open navigation");
    document.body.classList.remove("nav-open");
  };

  const openMobileMenu = () => {
    if (!navLinks || !menuToggle) return;

    navLinks.classList.add("is-open");
    menuToggle.classList.add("is-active");
    menuToggle.setAttribute("aria-expanded", "true");
    menuToggle.setAttribute("aria-label", "Close navigation");
    document.body.classList.add("nav-open");
  };

  if (menuToggle && navLinks) {
    menuToggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const isOpen = navLinks.classList.contains("is-open");

      if (isOpen) {
        closeMobileMenu();
      } else {
        openMobileMenu();
      }
    });

    navLinks.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        closeMobileMenu();
      });
    });

    document.addEventListener("click", (event) => {
      const clickedInsideMenu =
        navLinks.contains(event.target) || menuToggle.contains(event.target);

      if (!clickedInsideMenu && navLinks.classList.contains("is-open")) {
        closeMobileMenu();
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 800) {
        closeMobileMenu();
      }
    });
  }

  /* -----------------------------
     Animated counters
  ----------------------------- */

  document.querySelectorAll(".count").forEach((counter) => {
    const target = Number(counter.dataset.target || 0);
    const duration = 900;
    let started = false;

    const animate = () => {
      if (started) return;

      started = true;

      const start = performance.now();

      const tick = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);

        counter.textContent = String(Math.round(target * eased));

        if (progress < 1) {
          requestAnimationFrame(tick);
        }
      };

      requestAnimationFrame(tick);
    };

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            animate();
            observer.disconnect();
          }
        },
        {
          threshold: 0.4
        }
      );

      observer.observe(counter);
    } else {
      animate();
    }
  });

  /* -----------------------------
     Contact form submission
  ----------------------------- */

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const legalFiles = Array.from(legalDocumentsInput?.files || []);
    const frontFile = idFrontInput?.files?.[0] || null;
    const backFile = idBackInput?.files?.[0] || null;
    const uploads = [
      ...legalFiles.map((file) => ({ file, kind: "legalDocument" })),
      ...(frontFile ? [{ file: frontFile, kind: "idFront" }] : []),
      ...(backFile ? [{ file: backFile, kind: "idBack" }] : [])
    ];
    const typedName = typedSignature?.value.trim() || "";

    if (!signatureHasInk && typedName.length < 2) {
      setStatus("Please draw your signature or type your full name to approve this enquiry.", "error");
      signatureCanvas?.focus();
      return;
    }

    if (frontFile && !backFile || backFile && !frontFile) {
      setStatus("Upload both the front and back of your ID, or leave both fields empty.", "error");
      return;
    }

    if (legalFiles.length > 5) {
      setStatus("You can attach up to five legal documents.", "error");
      return;
    }

    const totalBytes = uploads.reduce((total, item) => total + item.file.size, 0);
    const uploadInvalid = uploads.some(({file, kind}) => {
      const isLegalDocument = kind === "legalDocument";
      const allowedType = isLegalDocument
        ? ["application/pdf", "image/jpeg", "image/png"].includes(file.type)
        : ["image/jpeg", "image/png"].includes(file.type);
      const sizeLimit = isLegalDocument ? 5 * 1024 * 1024 : 4 * 1024 * 1024;
      return !allowedType || file.size > sizeLimit;
    });
    if (uploadInvalid || totalBytes > 14 * 1024 * 1024) {
      setStatus("Legal documents must be PDF, JPG, or PNG and 5 MB or smaller. ID images must be JPG or PNG and 4 MB or smaller. All files together must be 14 MB or smaller.", "error");
      return;
    }

    const originalButtonText = submitButton?.textContent || "Submit";

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Sending…";
    }

    setStatus("");

    try {
      if (!supabaseClient) {
        throw new Error("Secure form storage is not configured yet. Please call or WhatsApp us at +91 95277 33070.");
      }
      const formData = new FormData(form);
      let { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        const { data, error } = await supabaseClient.auth.signInAnonymously();
        if (error) throw new Error(`Secure form sign-in failed: ${error.message}`);
        session = data.session;
      }
      const ownerId = session?.user?.id;
      if (!ownerId) throw new Error("Secure form sign-in failed. Please try again.");

      const submissionId = crypto.randomUUID();
      const uploadItems = [
        ...legalFiles.map((file) => ({ file, kind: "legal-document" })),
        ...(frontFile ? [{ file: frontFile, kind: "id-front" }] : []),
        ...(backFile ? [{ file: backFile, kind: "id-back" }] : [])
      ];
      let drawnSignatureBlob = null;
      if (signatureHasInk) {
        drawnSignatureBlob = await new Promise((resolve, reject) => signatureCanvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Your drawn signature could not be prepared. Please try again."));
        }, "image/png"));
        if (drawnSignatureBlob.size > 1024 * 1024) throw new Error("The drawn signature file is too large. Please clear it and try again.");
        uploadItems.push({ file: new File([drawnSignatureBlob], "approval.png", { type: "image/png" }), kind: "approval-signature" });
      }

      const uploadedPaths = [];
      const documentPaths = [];
      let approvalPath = null;
      let emailWarning = "";
      let submissionSaved = false;
      try {
        for (const item of uploadItems) {
          const extension = item.kind === "legal-document"
            ? (item.file.type === "application/pdf" ? "pdf" : item.file.type === "image/jpeg" ? "jpg" : "png")
            : (item.file.type === "image/jpeg" ? "jpg" : "png");
          const path = `${ownerId}/${submissionId}/${item.kind}-${crypto.randomUUID()}.${extension}`;
          const { error } = await supabaseClient.storage.from(documentBucket).upload(path, item.file, {
            contentType: item.file.type,
            cacheControl: "0",
            upsert: false
          });
          if (error) throw new Error(`Secure upload failed: ${error.message}`);
          uploadedPaths.push(path);
          if (item.kind === "approval-signature") approvalPath = path;
          else documentPaths.push({ kind: item.kind, path, contentType: item.file.type, sizeBytes: item.file.size });
        }

        const { error } = await supabaseClient.from("contact_submissions").insert({
          id: submissionId,
          owner_id: ownerId,
          name: String(formData.get("name") || "").trim(),
          email: String(formData.get("email") || "").trim().toLowerCase(),
          phone: String(formData.get("phone") || "").trim(),
          company: String(formData.get("company") || "").trim() || null,
          message: String(formData.get("message") || "").trim(),
          contact_consent: formData.has("consent"),
          document_consent: formData.has("documentConsent"),
          document_paths: documentPaths,
          approval_kind: signatureHasInk ? "drawn" : "typed",
          approval_name: signatureHasInk ? null : typedName,
          approval_path: approvalPath,
          approval_text: approvalText,
          approval_version: approvalVersion
        });
        if (error) throw new Error(`The enquiry could not be saved: ${error.message}`);
        submissionSaved = true;

        const { data: emailResult, error: emailError } = await supabaseClient.functions.invoke("email-contact-submission", {
          body: { submissionId }
        });
        if (emailError || !emailResult?.ok) {
          emailWarning = emailResult?.error || emailError?.message || "The enquiry was saved, but the email could not be sent.";
        }
      } catch (error) {
        if (!submissionSaved && uploadedPaths.length) {
          await supabaseClient.storage.from(documentBucket).remove(uploadedPaths).catch(() => {});
        }
        throw error;
      }

      form.reset();
      clearSignature();
      refreshUploadLabels();

      form.style.setProperty("display", "none", "important");

      if (title) {
        title.textContent = "Enquiry received";
      }

      if (description) {
        description.textContent = emailWarning
          ? `Your enquiry and approval were saved, but the email notification could not be confirmed. ${emailWarning}`
          : "Your enquiry and approval have been received and emailed to our team. Our team will follow up with you.";
      }
    } catch (error) {
      const message = error.message || "Something went wrong. Please try again or contact us directly.";
      setStatus(message, "error");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
      }
    }
  });

  /* -----------------------------
     Dynamic copyright year
  ----------------------------- */

  const year = document.getElementById("year");

  if (year) {
    year.textContent = String(new Date().getFullYear());
  }
});
