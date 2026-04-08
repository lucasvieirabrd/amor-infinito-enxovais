import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false
  }
});

export async function sendPasswordResetEmail(email: string, token: string) {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
  
  console.log('Tentando enviar email para:', email);
  console.log('EMAIL_USER configurado:', process.env.EMAIL_USER);
  console.log('EMAIL_PASS configurado:', process.env.EMAIL_PASS ? 'SIM' : 'NÃO');
  
  const info = await transporter.sendMail({
    from: `"Amor Infinito Enxovais" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Recuperação de Senha - Amor Infinito Enxovais',
    html: `
      <div>
        <p>Recuperação de Senha</p>
        <p>Clique no link abaixo para redefinir sua senha:</p>
        <a href="${resetUrl}">Redefinir Senha</a>
        <p>Este link expira em 1 hora.</p>
        <p>Se não solicitou, ignore este email.</p>
      </div>
    `,
  });
  
  console.log('Email enviado:', info.messageId);
}
