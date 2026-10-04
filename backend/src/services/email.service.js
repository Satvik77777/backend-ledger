const nodemailer = require('nodemailer');

let transporter = null;

// Initialize nodemailer: supports either Gmail App Password (EMAIL_PASS) or OAuth2
if (process.env.EMAIL_USER && process.env.NODE_ENV !== 'test') {
    if (process.env.EMAIL_PASS) {
        // Option 1: Gmail App Password (Reliable, never expires)
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: (process.env.EMAIL_PASS || '').replace(/\s+/g, ''),
            },
        });
        console.log('[EmailService] Configured with Gmail App Password authentication');
    } else if (process.env.CLIENT_ID && process.env.CLIENT_SECRET && process.env.REFRESH_TOKEN) {
        // Option 2: Google Cloud OAuth2
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                type: 'OAuth2',
                user: process.env.EMAIL_USER,
                clientId: process.env.CLIENT_ID,
                clientSecret: process.env.CLIENT_SECRET,
                refreshToken: process.env.REFRESH_TOKEN,
            },
        });
        console.log('[EmailService] Configured with Google OAuth2 authentication');
    }

    if (transporter) {
        transporter.verify((error) => {
            if (error) {
                console.warn('[EmailService] Email transporter not ready:', error.message);
            } else {
                console.log('[EmailService] Email server verified and ready to send messages');
            }
        });
    }
}

const sendEmail = async (to, subject, text, html) => {
    if (!transporter) {
        // If transporter isn't configured, log and return gracefully
        if (process.env.NODE_ENV !== 'test') {
            console.log(`[EmailService - Mock Dispatch] To: ${to}, Subject: ${subject}`);
        }
        return;
    }

    try {
        const info = await transporter.sendMail({
            from: `"Backend Ledger" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            text,
            html,
        });
        console.log(`[EmailService] Message sent: ${info.messageId}`);
    } catch (error) {
        console.error('[EmailService] Error dispatching email:', error.message);
    }
};

async function sendRegistrationEmail(userEmail, name) {
    const subject = 'Welcome to Backend Ledger!';
    const text = `Hello ${name},\n\nThank you for registering at Backend Ledger.\n\nBest regards,\nThe Backend Ledger Team`;
    const html = `<p>Hello ${name},</p><p>Thank you for registering at Backend Ledger.</p><p>Best regards,<br>The Backend Ledger Team</p>`;

    // Fire and forget so HTTP response is not blocked
    sendEmail(userEmail, subject, text, html).catch(() => {});
}

async function sendTransactionEmail(userEmail, name, amount, toAccount) {
    const subject = 'Transaction Successful!';
    const text = `Hello ${name},\n\nYour transaction of $${amount} to account ${toAccount} was successful.\n\nBest regards,\nThe Backend Ledger Team`;
    const html = `<p>Hello ${name},</p><p>Your transaction of $${amount} to account ${toAccount} was successful.</p><p>Best regards,<br>The Backend Ledger Team</p>`;

    sendEmail(userEmail, subject, text, html).catch(() => {});
}

async function sendTransactionFailureEmail(userEmail, name, amount, toAccount) {
    const subject = 'Transaction Failed';
    const text = `Hello ${name},\n\nYour transaction of $${amount} to account ${toAccount} has failed.\n\nBest regards,\nThe Backend Ledger Team`;
    const html = `<p>Hello ${name},</p><p>Your transaction of $${amount} to account ${toAccount} has failed.</p><p>Best regards,<br>The Backend Ledger Team</p>`;

    sendEmail(userEmail, subject, text, html).catch(() => {});
}

module.exports = {
    sendRegistrationEmail,
    sendTransactionEmail,
    sendTransactionFailureEmail
};