export async function onRequestPost(context) {
  const formData = await context.request.formData();
  const name = formData.get('name')?.toString() || 'Anonymous';
  const email = formData.get('email')?.toString() || 'No email provided';
  const message = formData.get('message')?.toString() || '(empty message)';
  const timestamp = new Date().toISOString();
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${context.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'DateWizza <support@datewizza.com>', // your verified domain
        to: 'datewizza@gmail.com', // your Gmail
        reply_to: email, // this sets Reply-To header so Gmail auto-replies to user's email
        subject: `New Contact Form Submission - ${timestamp}`,
        html: `
          <h2>New message from DateWizza contact form</h2>
          <p><strong>From:</strong> ${name} &lt;${email}&gt;</p>
          <p><strong>Message:</strong></p>
          <pre style="white-space: pre-wrap;">${message}</pre>
          <p><small>Sent: ${timestamp}</small></p>
        `,
        text: `New message from ${name} <${email}>\n\n${message}\n\nSent: ${timestamp}`
      })
    });
    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Resend failed: ${error}`);
    }
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    // Contact form error - return generic error response in production
    return new Response(JSON.stringify({ success: false, error: 'Failed to send' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}