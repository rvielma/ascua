import { defineIsland } from "ascua";
import { enhance, formResult } from "vite-plugin-ascua/form";

import type { ContactResult } from "../routes/contact.js";

/**
 * Without JavaScript it is a plain <form method="post">. Once hydrated,
 * enhance() sends it with fetch and shows the result without reloading.
 */
function ContactForm(props: { form?: ContactResult }) {
  const contact = enhance<ContactResult>({ initial: props.form });
  const errors = () => {
    const result = contact.result();
    return result && !result.ok ? result.errors : {};
  };
  const sent = () => {
    const result = contact.result();
    return result && result.ok && "sent" in result ? `Thanks, we will write to ${result.sent}.` : "";
  };

  return view`
    <form method="post" onsubmit=${contact.submit}>
      <label>Email <input name="email" type="email"></label>
      <p class="error">${() => errors().email ?? ""}</p>
      <label>Message <textarea name="message"></textarea></label>
      <p class="error">${() => errors().message ?? ""}</p>
      <button disabled=${() => contact.pending()}>Send</button>
      <p class="sent">${() => sent()}</p>
      <style>
        form { display: grid; gap: .25rem; }
        .error { color: crimson; margin: 0; min-height: 1.5em; }
      </style>
    </form>`;
}

export const ContactFormIsland = defineIsland("contact-form", { form: formResult<ContactResult>() }, ContactForm);
