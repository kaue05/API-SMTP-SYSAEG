const { createClient } = require("@supabase/supabase-js");

require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// Guardar códigos de recuperação (RAM - ideal para demo)
const codes = {};

app.post("/recuperar-senha", async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email obrigatório." });

    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    codes[email] = { codigo, expira: Date.now() + 10 * 60 * 1000 };

    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_PASS,
        },
    });

    try {
        await transporter.sendMail({
            from: "noreply.sysaeg@gmail.com",
            to: email,
            subject: "Seu código de recuperação",
            text: `Código: ${codigo}`,
            html: `<h2>Código de recuperação</h2><strong>${codigo}</strong>`,
        });
        res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: "Email falhou: " + err.message });
    }
});

app.post("/validar-codigo", (req, res) => {
    const { email, codigo } = req.body;
    const info = codes[email];
    if (!info || info.codigo !== codigo || Date.now() > info.expira) {
        return res.status(400).json({ error: "Código inválido ou expirado." });
    }
    res.json({ success: true });
});

app.post("/redefinir-senha", async (req, res) => {
    const { email, codigo, novaSenha, tipo } = req.body; // tipo pode ser 'aluno' ou 'professor'
    const info = codes[email];

    if (!info || info.codigo !== codigo || Date.now() > info.expira) {
        return res.status(400).json({ error: "Código inválido ou expirado." });
    }

    try {
        let userId = null;
        // Dependendo do tipo, busca no banco certo
        if (tipo === "professor") {
            const { data: prof, error: profError } = await supabase
                .from("professores")
                .select("id")
                .eq("email", email)
                .single();
            if (profError || !prof) return res.status(400).json({ error: "Professor não encontrado." });
            userId = prof.id;
        } else {
            const { data: aluno, error: alunoError } = await supabase
                .from("alunos")
                .select("id")
                .eq("email", email)
                .single();
            if (alunoError || !aluno) return res.status(400).json({ error: "Aluno não encontrado." });
            userId = aluno.id;
        }

        // Troca de senha Supabase (mesmo para alunos ou professores, desde que estejam autenticados pelo Supabase)
        const { error } = await supabase.auth.admin.updateUserById(userId, {
            password: novaSenha,
        });

        if (error) {
            return res.status(500).json({ error: "Falha ao alterar senha." });
        }

        delete codes[email];
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API rodando na porta ${PORT}`));
