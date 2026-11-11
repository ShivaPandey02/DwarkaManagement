document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("contactModal");
  const form = document.getElementById("contactForm");
  const status = document.getElementById("formStatus");
  const title = document.getElementById("contactModalTitle");
  const description = title?.nextElementSibling;
  const submitButton = document.getElementById("submitContactButton");

  const menuToggle = document.getElementById("menuToggle");
  const navLinks = document.getElementById("navLinks");

  const originalTitle = title?.textContent || "Start a conversation";
  const originalDescription =
    description?.textContent || "Tell us what you are building.";

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
    if (event.key === "Escape" && modal && !modal.hidden) {
      closeModal();
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
    document.body.classList.remove("nav-open");
  };

  const openMobileMenu = () => {
    if (!navLinks || !menuToggle) return;

    navLinks.classList.add("is-open");
    menuToggle.classList.add("is-active");
    menuToggle.setAttribute("aria-expanded", "true");
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

    const originalButtonText = submitButton?.textContent || "Submit";

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Sending…";
    }

    setStatus("");

    const formData = new FormData(form);

    formData.append("_subject", "New Dwarka Management enquiry");
    formData.append("_template", "table");
    formData.append("_captcha", "false");

    try {
      const response = await fetch(
        "https://formsubmit.co/ajax/shivapandey232000@gmail.com",
        {
          method: "POST",
          headers: {
            Accept: "application/json"
          },
          body: formData
        }
      );

      if (!response.ok) {
        throw new Error("Request failed");
      }

      form.reset();

      form.style.setProperty("display", "none", "important");

      if (title) {
        title.textContent = "Thank you for reaching out";
      }

      if (description) {
        description.textContent =
          "Your enquiry has been received. Our team will get back to you shortly.";
      }
    } catch (error) {
      setStatus(
        "Something went wrong. Please try again or email us directly.",
        "error"
      );
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