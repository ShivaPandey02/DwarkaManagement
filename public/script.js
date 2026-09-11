document.getElementById("year").textContent = new Date().getFullYear();

const form = document.getElementById("contactForm");
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const subject = encodeURIComponent(`Velron Ventures inquiry from ${data.get("name")}`);
  const body = encodeURIComponent(
`Name: ${data.get("name")}
Email: ${data.get("email")}
Company: ${data.get("company") || "—"}

Message:
${data.get("message")}`
  );
  window.location.href = `mailto:hello@velronventures.com?subject=${subject}&body=${body}`;
});