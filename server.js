server.js

require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const sql = require('mssql'); // <-- Driver do SQL Server
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Configuração de conexão para SQL Server
const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_HOST, // Ex: 'meu-servidor.database.windows.net'
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT) || 1433, // Porta padrão do SQL Server
    options: {
        encrypt: true, // <-- ESSENCIAL para conexões Azure/cloud
        trustServerCertificate: false // <-- Deixe como false para produção
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

let pool = null;

async function getConnection() {
    if (!pool) {
        try {
            pool = await sql.connect(dbConfig);
            console.log('✅ Conectado ao SQL Server com sucesso!');
        } catch (err) {
            console.error('❌ Falha ao conectar ao SQL Server:', err.message);
            pool = null;
            throw new Error('Banco de dados indisponível no momento');
        }
    }
    return pool;
}

app.post('/api/alunos', async (req, res) => {
    const { nome_completo, usuario_acesso, senha_hash, email_aluno, observacao } = req.body;

    // Validações...
    const errors = [];
    if (!nome_completo || nome_completo.trim() === '') errors.push('Nome completo é obrigatório');
    if (!usuario_acesso || usuario_acesso.trim() === '') errors.push('Usuário de acesso é obrigatório');
    if (!senha_hash || senha_hash.trim() === '') errors.push('Senha é obrigatória');
    if (!email_aluno || email_aluno.trim() === '') errors.push('E-mail é obrigatório');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email_aluno)) errors.push('E-mail inválido');

    if (errors.length > 0) {
        return res.status(400).json({ sucesso: false, erros: errors });
    }

    try {
        const hashedPassword = await bcrypt.hash(senha_hash, 10);
        const dbPool = await getConnection();

        // Comando SQL para SQL Server (usando parâmetros nomeados)
        const result = await dbPool.request()
            .input('nome', sql.NVarChar, nome_completo)
            .input('usuario', sql.NVarChar, usuario_acesso)
            .input('senha', sql.NVarChar, hashedPassword)
            .input('email', sql.NVarChar, email_aluno)
            .input('obs', sql.NVarChar, observacao || null)
            .query(`
                INSERT INTO alunos_leonardo (nome_completo, usuario_acesso, senha_hash, email_aluno, observacao)
                VALUES (@nome, @usuario, @senha, @email, @obs);
                SELECT SCOPE_IDENTITY() AS id;
            `);

        const insertedId = result.recordset[0].id;

        res.status(201).json({
            sucesso: true,
            mensagem: 'Aluno cadastrado com sucesso!',
            id: insertedId
        });

    } catch (error) {
        console.error('Erro ao inserir:', error);
        if (error.number === 2627) { // Código de violação de chave única (UNIQUE) no SQL Server
            return res.status(409).json({ 
                sucesso: false, 
                erros: ['Usuário ou e-mail já cadastrado.'] 
            });
        }
        res.status(500).json({ 
            sucesso: false, 
            erros: ['Erro interno no servidor.'] 
        });
    }
});

app.get('/api/status', (req, res) => {
    res.json({ status: 'API funcionando! Aguardando conexão com banco...' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Back-end rodando na porta ${PORT}`);
});