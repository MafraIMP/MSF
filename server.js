const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const app = express();

// CORREÇÃO CRUCIAL: Define a porta 80 por padrão, mas aceita portas dinâmicas para servidores externos
const PORT = process.env.PORT || 80;

// APRIMORAMENTO: Permite o envio de dados pesados (como imagens inseridas no terminal)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// APRIMORAMENTO: Habilita CORS nativo para evitar bloqueios ao acessar de outros dispositivos na rede
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Serve os arquivos da pasta public (index.html, imagens, sons)
app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE = path.join(__dirname, 'data.json');

// Credenciais originais preservadas exatamente como estavam
const VALID_USERS = {
    "admin": "1234",
    "mafrainf": "m1a2f3r4a5",
    "gears": "scp079"
};

// Inicializa o arquivo de dados se não existir
if (!fs.existsSync(DATA_FILE)) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
    } catch (err) {
        console.error("[ERRO] Não foi possível criar o arquivo data.json:", err);
    }
}

// APRIMORAMENTO: Leitura segura com tratamento de erro robusto
function getDatabase() {
    try {
        if (!fs.existsSync(DATA_FILE)) return [];
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(raw || '[]');
    } catch (e) { 
        console.error("[ERRO] Falha ao ler banco de dados. Retornando array vazio.", e);
        return []; 
    }
}

// APRIMORAMENTO: Escrita segura formatada para fácil leitura humana no arquivo JSON
function saveDatabase(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error("[ERRO] Falha ao salvar dados no arquivo:", e);
        return false;
    }
}

// ---------------- ENDPOINTS ----------------

// Autenticação (Mantida idêntica à sua lógica original)
app.post('/api/auth', (req, res) => {
    const { user, pass } = req.body;
    
    if (!user || !pass) {
        return res.status(400).json({ success: false, message: "Usuário e senha são obrigatórios." });
    }
    
    const normalizedUser = user.toLowerCase().trim();
    
    if (VALID_USERS[normalizedUser] && VALID_USERS[normalizedUser] === pass) {
        console.log(`[ACESSO PERMITIDO] Operador: ${normalizedUser}`);
        return res.json({ success: true, token: "AUTH_VALID" });
    }
    
    console.log(`[ACESSO NEGADO] Tentativa inválida para o usuário: ${user}`);
    res.status(401).json({ success: false, message: "Credenciais inválidas." });
});

// Listar Documentos
app.get('/api/docs', (req, res) => {
    res.json(getDatabase());
});

// Criar Documento (Flexibilizado para aceitar qualquer campo extra enviado pelo front-end)
app.post('/api/docs', (req, res) => {
    const db = getDatabase();
    
	// --- ADIÇÃO: Rota para atualizar o cargo de um usuário ---
app.put('/api/users/:username', (req, res) => {
    const users = getUsers();
    const username = req.params.username;
    const newRole = req.body.role;

    // Procura o usuário no array e atualiza o cargo se existir
    const userIndex = users.findIndex(u => u.username === username);
    if (userIndex !== -1) {
        users[userIndex].role = newRole;
        // Salva a alteração de volta no arquivo users.json
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false, message: "Usuário não encontrado." });
    }
});
	
    // Mapeia os campos originais, mas aceita expansões automáticas via operador spread (...)
    const newDoc = {
        id: crypto.randomUUID(),
        title: req.body.title || "SEM TÍTULO",
        category: req.body.category || "GERAL",
        content: req.body.content || "",
        isIndigo: req.body.isIndigo || false,
        infoLevel: req.body.infoLevel || "Agente",
        dangerLevel: req.body.dangerLevel || "Irrelevante",
        timestamp: new Date().toISOString(),
        dateFormatted: new Date().toLocaleDateString('pt-BR'),
        ...req.body // Garante que campos novos como unit-image ou unit-desc não sejam perdidos
    };

    db.push(newDoc);
    const success = saveDatabase(db);

    if (success) {
        res.status(201).json({ success: true, document: newDoc });
    } else {
        res.status(500).json({ success: false, message: "Erro interno ao salvar o registro." });
    }
});

// Adicionar ao seu server.js
const USERS_FILE = path.join(__dirname, 'users.json');

// Função para ler usuários do disco
function getUsers() {
    if (!fs.existsSync(USERS_FILE)) return [];
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

// Rota para o Front-end buscar a lista (A Gestão M.G.I vai usar isto)
app.get('/api/users', (req, res) => {
    res.json(getUsers());
});

// Rota para salvar um usuário novo
app.post('/api/users', (req, res) => {
    const users = getUsers();
    const newUser = req.body;
    if (!users.find(u => u.username === newUser.username)) {
        users.push(newUser);
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    }
    res.status(201).send();
});

// APRIMORAMENTO: Endpoint de Deleção robusto conectado ao data.json
app.delete('/api/docs/:id', (req, res) => {
    const { id } = req.params;
    let db = getDatabase();
    const initialLength = db.length;
    
    db = db.filter(doc => doc.id !== id);
    
    if (db.length === initialLength) {
        return res.status(404).json({ success: false, message: "Registro não encontrado." });
    }
    
    const success = saveDatabase(db);
    if (success) {
        console.log(`[EXPURGO] Registro ID ${id} removido com sucesso.`);
        res.json({ success: true, message: "Documento expurgado permanentemente." });
    } else {
        res.status(500).json({ success: false, message: "Erro ao salvar alterações após exclusão." });
    }
});

// Inicialização do servidor
app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`  SISTEMA TERMINAL GATEWAY ONLINE`);
    console.log(`  Servidor ativo na porta: ${PORT}`);
    console.log(`  Endereço Local: http://localhost:${PORT}`);
    console.log(`==================================================`);
});