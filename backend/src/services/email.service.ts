import nodemailer from 'nodemailer';
import dns from 'dns';

// Forçar IPv4 para evitar bloqueio IPv6 do Railway
dns.setDefaultResultOrder('ipv4first');

const transporter = nodemailer.createTransport({
  host: '74.125.20.108', // IP fixo IPv4 do smtp.gmail.com
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false,
    servername: 'smtp.gmail.com'
  },
  family: 4
});

export async function sendPasswordResetEmail(email: string, token: string) {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
  
  console.log('Tentando enviar email para:', email);
  console.log('EMAIL_USER configurado:', process.env.EMAIL_USER);
  console.log('EMAIL_PASS configurado:', process.env.EMAIL_PASS ? 'SIM' : 'NÃO');
  
  const info = await transporter.sendMail({
    from: `"Amor Infinito Enxovais" <${process.EMAIL_USER}>`,
    to: email,
    subject: 'Recuperação de Senha - Amor Infinito Enxovais',
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Recuperação de Senha</h2>
        <p>Clique no link abaixo para redefinir sua senha:</p>
        <p><a href="${resetUrl}" style="background-color: #6C63FF; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Redefinir Senha</a></p>
        <p>Este link expira em 1 hora.</p>
        <p>Se não solicitou, ignore este email.</p>
      </div>
    `,
  });
  
  console.log('Email enviado com sucesso:', info.messageId);
}
