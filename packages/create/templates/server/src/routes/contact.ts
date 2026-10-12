import { fail, field, fields, validate, type ActionContext, type FormResult } from "vite-plugin-ascua/site";

import { ContactFormIsland } from "../islands/contact-form.js";

export const Message = fields({
  email: field.email(),
  message: field.text({ max: 500 }),
});

export type ContactResult = FormResult<typeof Message> | { ok: true; sent: string };

/** The POST of the form. Same-origin only, validated on the server. */
export const actions = {
  async default({ formData }: ActionContext): Promise<ContactResult | ReturnType<typeof fail>> {
    const result = await validate(Message, formData);
    if (!result.ok) return fail(400, result);
    // Store it, send an email…
    return { ok: true, sent: result.data.email };
  },
};

export const title = "Contact";

export default function Contact({ form }: { form?: ContactResult }) {
  return view`
    <section>
      <h1>Contact</h1>
      <ContactFormIsland form=${form}/>
    </section>`;
}
