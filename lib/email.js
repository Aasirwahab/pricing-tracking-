import { Resend } from "resend";

// Brevo is the primary provider (free tier can email any recipient with a
// verified sender). Resend is the fallback. Either can be left unconfigured.
async function sendViaBrevo({ to, subject, html }) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: process.env.SENDER_EMAIL, name: "DealDrop" },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    throw new Error(`Brevo ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function sendViaResend({ to, subject, html }) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to,
    subject,
    html,
  });

  if (error) {
    throw new Error(`Resend: ${error.message || JSON.stringify(error)}`);
  }
  return data;
}

const providers = [
  {
    name: "brevo",
    enabled: () => process.env.BREVO_API_KEY && process.env.SENDER_EMAIL,
    send: sendViaBrevo,
  },
  {
    name: "resend",
    enabled: () =>
      process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL,
    send: sendViaResend,
  },
];

export async function sendEmail(message) {
  const errors = [];

  for (const provider of providers) {
    if (!provider.enabled()) continue;

    try {
      const data = await provider.send(message);
      console.log(`Email sent via ${provider.name} to ${message.to}`);
      return { success: true, provider: provider.name, data };
    } catch (error) {
      console.error(`Email via ${provider.name} failed:`, error.message);
      errors.push(`${provider.name}: ${error.message}`);
    }
  }

  return {
    error: errors.length ? errors.join("; ") : "No email provider configured",
  };
}

export async function sendPriceDropAlert(
  userEmail,
  product,
  oldPrice,
  newPrice
) {
  try {
    const priceDrop = oldPrice - newPrice;
    const percentageDrop = ((priceDrop / oldPrice) * 100).toFixed(1);

    return await sendEmail({
      to: userEmail,
      subject: `🎉 Price Drop Alert: ${product.name}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            
            <div style="background: linear-gradient(135deg, #FA5D19 0%, #FF8C42 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">🎉 Price Drop Alert!</h1>
            </div>
            
            <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
              
              ${
                product.image_url
                  ? `
                <div style="text-align: center; margin-bottom: 20px;">
                  <img src="${product.image_url}" alt="${product.name}" style="max-width: 200px; height: auto; border-radius: 8px; border: 1px solid #e5e7eb;">
                </div>
              `
                  : ""
              }
              
              <h2 style="color: #1f2937; margin-top: 0;">${product.name}</h2>
              
              <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0; font-size: 14px; color: #92400e;">
                  <strong>Price dropped by ${percentageDrop}%!</strong>
                </p>
              </div>
              
              <table style="width: 100%; margin: 20px 0;">
                <tr>
                  <td style="padding: 10px; background: #f9fafb; border-radius: 4px;">
                    <div style="font-size: 14px; color: #6b7280;">Previous Price</div>
                    <div style="font-size: 20px; color: #9ca3af; text-decoration: line-through;">
                      ${product.currency} ${oldPrice.toFixed(2)}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 10px;">
                    <div style="font-size: 14px; color: #6b7280;">Current Price</div>
                    <div style="font-size: 32px; color: #FA5D19; font-weight: bold;">
                      ${product.currency} ${newPrice.toFixed(2)}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 10px; background: #dcfce7; border-radius: 4px;">
                    <div style="font-size: 14px; color: #166534;">You Save</div>
                    <div style="font-size: 24px; color: #16a34a; font-weight: bold;">
                      ${product.currency} ${priceDrop.toFixed(2)}
                    </div>
                  </td>
                </tr>
              </table>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${product.url}" 
                   style="display: inline-block; background: #FA5D19; color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                  View Product →
                </a>
              </div>
              
              <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 20px; text-align: center; color: #6b7280; font-size: 12px;">
                <p>You're receiving this email because you're tracking this product on Price Tracker.</p>
                <p style="margin-top: 10px;">
                  <a href="${
                    process.env.NEXT_PUBLIC_APP_URL
                  }" style="color: #FA5D19; text-decoration: none;">
                    View All Tracked Products
                  </a>
                </p>
              </div>
            </div>
            
          </body>
        </html>
      `,
    });
  } catch (error) {
    console.error("Email error:", error);
    return { error: error.message };
  }
}
