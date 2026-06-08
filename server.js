const express = require('express');
const fs = require('fs').promises; // USO DE PROMISES PARA MÁXIMA EFICIÊNCIA (Não trava o servidor)
const path = require('path');
const app = express();

const PORT = process.env.PORT || 80;

// Configurações de tráfego pesado e CORS
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// Arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Caminhos dos Bancos de Dados
const DATA_FILE = path.join(__dirname, 'data.json');
const USERS_FILE = path.join(__dirname, 'users.json');

const VALID_ADMIN_PASSWORDS = [
    "senha123", "admin456", "msf2024"
];

// ==========================================
// FUNÇÕES DE BANCO DE DADOS (ASSÍNCRONAS)
// ==========================================

// Função inteligente para ler JSON (com proteção contra quebras)
async function getDatabase(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // Se o arquivo não existir, cria um array vazio e devolve
        if (error.code === 'ENOENT' || error.name === 'SyntaxError') {
            await fs.writeFile(filePath, '[]');
            return [];
        }
        console.error(`[ERRO] Falha ao ler ${filePath}:`, error);
        return [];
    }
}

// Função inteligente para salvar JSON
// ==========================================
// CONFIGURAÇÕES DO GITHUB (ATENÇÃO AQUI, MAFRA)
// ==========================================
const REPO_OWNER = 'MafraIMP'; // Ex: MafraINF
const REPO_NAME = 'MSF'; // Ex: mgi-terminal
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; 

// Função inteligente para salvar JSON direto no GitHub
async function saveDatabase(filePath, data) {
    const fileBaseName = require('path').basename(filePath);
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${fileBaseName}`;
    
    const headers = {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28'
    };

    try {
        // 1. O GitHub precisa saber a versão atual do arquivo para autorizar a mudança
        const getFileReq = await fetch(url, { headers });
        const fileData = await getFileReq.json();
        
        // Se o arquivo não existir ainda no repositório, o SHA será indefinido, e tudo bem.
        const currentSha = fileData.sha ? fileData.sha : null;

        // 2. Converte o seu banco de dados para a criptografia Base64 (exigência do GitHub)
        const jsonString = JSON.stringify(data, null, 2);
        const contentBase64 = Buffer.from(jsonString).toString('base64');

        // 3. Dispara a atualização para o Quartel General
        const putFileReq = await fetch(url, {
            method: 'PUT',
            headers: headers,
            body: JSON.stringify({
                message: `M.S.F Auto-Sync: Atualização no banco de dados (${fileBaseName})`,
                content: contentBase64,
                sha: currentSha
            })
        });

        if (putFileReq.ok) {
            console.log(`[BACKUP SEGURO] ${fileBaseName} sincronizado com sucesso no GitHub.`);
            
            // Grava localmente também para manter a fluidez imediata do servidor
            const fs = require('fs').promises;
            await fs.writeFile(filePath, jsonString);
            
            return true;
        } else {
            const errorMsg = await putFileReq.text();
            console.error("[ERRO DE TRANSMISSÃO] Falha ao enviar para o GitHub:", errorMsg);
            return false;
        }

    } catch (error) {
        console.error(`[ERRO CRÍTICO] Ocorreu uma falha grave ao salvar ${fileBaseName}:`, error);
        return false;
    }
}

// ==========================================
// ROTAS DE AUTENTICAÇÃO E USUÁRIOS
// ==========================================

// Verificar senha de Administrador (Preservado da sua lógica original)
app.post('/api/verify', (req, res) => {
    const { password } = req.body;
    if (VALID_ADMIN_PASSWORDS.includes(password)) {
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// Listar todos os usuários
app.get('/api/users', async (req, res) => {
    const users = await getDatabase(USERS_FILE);
    res.json(users);
});

// Criar novo usuário
app.post('/api/users', async (req, res) => {
    const users = await getDatabase(USERS_FILE);
    const newUser = req.body;
    
    if (!users.find(u => u.username === newUser.username)) {
        users.push(newUser);
        await saveDatabase(USERS_FILE, users);
    }
    res.status(201).json({ success: true });
});

// Atualizar cargo do usuário (Gestão M.G.I)
app.put('/api/users/:username', async (req, res) => {
    const users = await getDatabase(USERS_FILE);
    const username = req.params.username;
    const newRole = req.body.role;

    const userIndex = users.findIndex(u => u.username === username);
    if (userIndex !== -1) {
        users[userIndex].role = newRole;
        await saveDatabase(USERS_FILE, users);
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false, message: "Usuário não encontrado." });
    }
});

// --- NOVA ROTA: Aprovar alteração de nível pelo administrador mafrainf ---
app.post('/api/admin/approve-level', async (req, res) => {
    const { username, newRole, docId } = req.body;
    
    if (!username || !newRole || !docId) {
        return res.status(400).json({ success: false, message: "Dados incompletos." });
    }

    // 1. Atualiza o nível no arquivo de usuários
    const users = await getDatabase(USERS_FILE);
    const userIndex = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
    
    if (userIndex !== -1) {
        users[userIndex].role = newRole;
        await saveDatabase(USERS_FILE, users);
    } else {
        users.push({ username: username.toLowerCase(), role: newRole });
        await saveDatabase(USERS_FILE, users);
    }

    // 2. Remove o documento de solicitação
    let db = await getDatabase(DATA_FILE);
    db = db.filter(doc => doc.id !== docId);
    await saveDatabase(DATA_FILE, db);

    console.log(`[ADMIN] Nível de ${username} atualizado para ${newRole}. Solicitação aprovada.`);
    res.json({ success: true, message: "Nível atualizado com sucesso!" });
});

// ==========================================
// ROTAS DE DOCUMENTOS (DATA.JSON)
// ==========================================

// Listar todos os documentos
app.get('/api/docs', async (req, res) => {
    const db = await getDatabase(DATA_FILE);
    res.json(db);
});

// Criar novo documento
app.post('/api/docs', async (req, res) => {
    const db = await getDatabase(DATA_FILE);
    const newDoc = req.body;
    
    if (!db.find(d => d.id === newDoc.id)) {
        db.push(newDoc);
        const success = await saveDatabase(DATA_FILE, db);
        if (success) return res.status(201).json({ success: true });
    }
    res.status(500).json({ success: false, message: "Erro ao criar documento." });
});

// Editar/Atualizar documento existente
app.put('/api/docs/:id', async (req, res) => {
    const { id } = req.params;
    const db = await getDatabase(DATA_FILE);
    const updatedDoc = req.body;
    
    const index = db.findIndex(d => d.id === id);
    if (index !== -1) {
        db[index] = { ...db[index], ...updatedDoc };
        const success = await saveDatabase(DATA_FILE, db);
        if (success) return res.json({ success: true });
    }
    res.status(404).json({ success: false, message: "Documento não encontrado." });
});

// Excluir documento (Expurgo)
app.delete('/api/docs/:id', async (req, res) => {
    const { id } = req.params;
    let db = await getDatabase(DATA_FILE);
    const initialLength = db.length;
    
    db = db.filter(doc => doc.id !== id);
    
    if (db.length === initialLength) {
        return res.status(404).json({ success: false, message: "Registro não encontrado." });
    }
    
    const success = await saveDatabase(DATA_FILE, db);
    if (success) {
        console.log(`[EXPURGO] Registro ID ${id} removido.`);
        res.json({ success: true, message: "Documento expurgado permanentemente." });
    } else {
        res.status(500).json({ success: false, message: "Erro ao salvar alterações após exclusão." });
    }
});

// --- NOVA ROTA: Sincronização Forçada (Overwrite Completo) ---
app.post('/api/docs/sync-all', async (req, res) => {
    const allDocs = req.body;
    
    // Verifica se os dados recebidos são uma lista válida
    if (!Array.isArray(allDocs)) {
        return res.status(400).json({ success: false, message: "Formato inválido para sincronização." });
    }
    
    // Sobrescreve o arquivo data.json completamente com a lista atualizada
    const success = await saveDatabase(DATA_FILE, allDocs);
    if (success) {
        console.log(`[BACKUP FORÇADO] Base de dados totalmente reescrita por comando Supremo. Total de registros: ${allDocs.length}`);
        res.json({ success: true, message: "Banco de dados sincronizado com sucesso!" });
    } else {
        res.status(500).json({ success: false, message: "Erro crítico ao processar o backup forçado." });
    }
});

// ==========================================
// INICIALIZAÇÃO
// ==========================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[MSF SYSTEM] Servidor Central operando eficientemente na porta ${PORT}`);
});