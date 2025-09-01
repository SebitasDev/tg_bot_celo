const { Telegraf } = require('telegraf');
const mysql = require('mysql2/promise');
const express = require('express');

// Configuración
const BOT_TOKEN = '8291866498:AAFcJI7V-Cq1AeiB0KmcvdaTWEMWLYzFt6U';
const DB_CONFIG = {
    host: 'bc8tvatjrbafgmszkqbk-mysql.services.clever-cloud.com',
    database: 'bc8tvatjrbafgmszkqbk',
    user: 'ugzv7txkz1anf9iy',
    password: 'SYbGXOcsFB7dHMuFhRkF',
    port: 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
};

// Variables globales
let pool;
const bot = new Telegraf(BOT_TOKEN);

// Función para crear la conexión a la base de datos
async function createDBConnection() {
    try {
        pool = await mysql.createPool(DB_CONFIG);
        console.log('✅ Conexión a MySQL establecida');
        await createTables();
        return pool;
    } catch (error) {
        console.error('❌ Error conectando a MySQL:', error);
        setTimeout(createDBConnection, 5000);
    }
}

// Función para crear las tablas si no existen
async function createTables() {
    try {
        const connection = await pool.getConnection();

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS invitations (
                id INT PRIMARY KEY AUTO_INCREMENT,
                inviter_id BIGINT NOT NULL,
                inviter_username VARCHAR(255),
                invited_id BIGINT NOT NULL,
                invited_username VARCHAR(255),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_inviter_id (inviter_id),
                INDEX idx_invited_id (invited_id)
            )
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS ranking (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id BIGINT UNIQUE NOT NULL,
                username VARCHAR(255),
                count INT DEFAULT 0,
                INDEX idx_count (count DESC)
            )
        `);

        connection.release();
        console.log('✅ Tablas creadas/verificadas correctamente');
    } catch (error) {
        console.error('❌ Error creando tablas:', error);
    }
}

// Función para ejecutar queries con reintentos
async function executeQuery(query, params = []) {
    let retries = 3;
    while (retries > 0) {
        try {
            const [results] = await pool.execute(query, params);
            return results;
        } catch (error) {
            console.error(`❌ Error ejecutando query (intentos restantes: ${retries - 1}):`, error);
            retries--;
            if (retries === 0) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

// Función para registrar una invitación
async function registerInvitation(inviterId, inviterUsername, invitedId, invitedUsername) {
    try {
        const existing = await executeQuery(
            'SELECT * FROM invitations WHERE inviter_id = ? AND invited_id = ?',
            [inviterId, invitedId]
        );

        if (existing.length > 0) {
            console.log('⚠️ Invitación ya registrada');
            return false;
        }

        await executeQuery(
            'INSERT INTO invitations (inviter_id, inviter_username, invited_id, invited_username) VALUES (?, ?, ?, ?)',
            [inviterId, inviterUsername || null, invitedId, invitedUsername || null]
        );

        await executeQuery(
            `INSERT INTO ranking (user_id, username, count) 
             VALUES (?, ?, 1) 
             ON DUPLICATE KEY UPDATE 
             count = count + 1,
             username = VALUES(username)`,
            [inviterId, inviterUsername || 'Unknown']
        );

        console.log(`✅ Invitación registrada: ${inviterUsername} invitó a ${invitedUsername}`);
        return true;
    } catch (error) {
        console.error('❌ Error registrando invitación:', error);
        return false;
    }
}

// Función para obtener el ranking
async function getRanking() {
    try {
        const results = await executeQuery(
            'SELECT username, count FROM ranking ORDER BY count DESC LIMIT 10'
        );
        return results;
    } catch (error) {
        console.error('❌ Error obteniendo ranking:', error);
        return [];
    }
}

// Middleware para logging
bot.use((ctx, next) => {
    if (ctx.message?.text?.startsWith('/')) {
        console.log('\n=== COMANDO DETECTADO ===');
        console.log('📨 Texto:', ctx.message.text);
        console.log('👤 De:', ctx.from.username || ctx.from.first_name);
        console.log('💬 Tipo de chat:', ctx.chat.type);
        console.log('🏷️ Nombre del chat:', ctx.chat.title || 'Chat privado');
        console.log('🆔 ID del chat:', ctx.chat.id);
        console.log('========================\n');
    }
    return next();
});

// Comando /start
bot.command('start', (ctx) => {
    console.log('🚀 Procesando comando /start...');
    const message = `👋 ¡Hola! Soy un bot que registra las invitaciones a grupos.

📋 *Comandos disponibles:*
/start - Este mensaje
/help - Ayuda y estado
/ranking - Ver el top 10 de usuarios que más han invitado
/ping - Verificar que el bot funciona

💡 *Cómo funciona:*
Cuando alguien añade a una persona al grupo, registro la invitación automáticamente.`;

    ctx.reply(message, { parse_mode: 'Markdown' })
        .then(() => console.log('✅ Start enviado'))
        .catch(err => console.error('❌ Error:', err));
});

// Comando /help
bot.command('help', (ctx) => {
    console.log('❓ Comando /help recibido');
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';

    let helpMessage = '📋 *Comandos disponibles:*\n\n';
    helpMessage += '/start - Información del bot\n';
    helpMessage += '/ranking - Top 10 invitadores\n';
    helpMessage += '/ping - Verificar funcionamiento\n';
    helpMessage += '/help - Este mensaje\n\n';

    if (isGroup) {
        helpMessage += '✅ *Estoy funcionando en este grupo*\n';
        helpMessage += `📍 Grupo: ${ctx.chat.title}\n`;
        helpMessage += `🆔 ID: ${ctx.chat.id}`;
    } else {
        helpMessage += '💬 *Estás en chat privado*\n';
        helpMessage += 'Añádeme a un grupo para registrar invitaciones';
    }

    ctx.reply(helpMessage, { parse_mode: 'Markdown' })
        .then(() => console.log('✅ Help enviado'))
        .catch(err => console.error('❌ Error:', err));
});

// Comando /ping
bot.command('ping', (ctx) => {
    console.log('🏓 Ping recibido');
    ctx.reply('🏓 Pong!')
        .then(() => console.log('✅ Pong enviado'))
        .catch(err => console.error('❌ Error:', err));
});

// Comando /ranking
bot.command('ranking', async (ctx) => {
    console.log('📊 Procesando comando /ranking...');

    try {
        const ranking = await getRanking();

        if (ranking.length === 0) {
            await ctx.reply('📊 No hay datos de ranking todavía.');
            return;
        }

        let message = '🏆 *TOP 10 - Usuarios que más han invitado:*\n\n';
        ranking.forEach((user, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            message += `${medal} @${user.username}: *${user.count}* invitaciones\n`;
        });

        await ctx.reply(message, { parse_mode: 'Markdown' });
        console.log('✅ Ranking enviado');
    } catch (error) {
        console.error('❌ Error mostrando ranking:', error);
        ctx.reply('❌ Error al obtener el ranking. Intenta más tarde.');
    }
});

// Manejar nuevos miembros
bot.on('new_chat_members', async (ctx) => {
    console.log('📥 Nuevos miembros detectados');
    const newMembers = ctx.message.new_chat_members;
    const inviter = ctx.from;

    for (const member of newMembers) {
        // No registrar si el bot se une o si el usuario se une solo
        if (member.is_bot || member.id === inviter.id) continue;

        console.log(`👤 ${inviter.username} invitó a ${member.username}`);

        const success = await registerInvitation(
            inviter.id,
            inviter.username,
            member.id,
            member.username
        );

        if (success) {
            await ctx.reply(
                `👋 ¡Bienvenido ${member.first_name}!\n` +
                `✨ Invitado por: @${inviter.username || inviter.first_name}`
            );
        }
    }
});

// Manejar cuando alguien sale del grupo
bot.on('left_chat_member', (ctx) => {
    const leftMember = ctx.message.left_chat_member;
    console.log(`👋 ${leftMember.first_name} salió del grupo`);
    ctx.reply(`👋 ${leftMember.first_name} ha salido del grupo`);
});

// Detectar cuando el bot es añadido a un grupo
bot.on('my_chat_member', (ctx) => {
    const newStatus = ctx.myChatMember.new_chat_member.status;
    const oldStatus = ctx.myChatMember.old_chat_member.status;

    console.log('🔔 Cambio en membresía del bot:', {
        chat: ctx.chat.title || ctx.chat.id,
        type: ctx.chat.type,
        new_status: newStatus,
        old_status: oldStatus
    });

    if ((newStatus === 'member' || newStatus === 'administrator') && oldStatus === 'left') {
        ctx.reply(
            '👋 ¡Hola! Gracias por añadirme al grupo.\n' +
            'Por favor, hazme administrador para poder detectar las invitaciones.\n' +
            'Usa /help para ver los comandos disponibles.'
        );
    }
});

// Configurar Express para health check
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.get('/', (req, res) => {
    res.json({
        status: 'running',
        bot: 'Telegram Invitation Tracker (Telegraf)',
        version: '2.0.0'
    });
});

// Inicializar todo
async function start() {
    try {
        // Conectar a la base de datos
        await createDBConnection();

        // Lanzar el bot
        await bot.launch();
        console.log('✅ Bot de Telegraf iniciado');

        // Iniciar el servidor Express
        app.listen(PORT, () => {
            console.log(`✅ Servidor Express ejecutándose en puerto ${PORT}`);
        });

    } catch (error) {
        console.error('❌ Error iniciando la aplicación:', error);
        process.exit(1);
    }
}

// Manejar cierre graceful
process.once('SIGINT', () => {
    console.log('\n🛑 Cerrando aplicación...');
    bot.stop('SIGINT');
    if (pool) pool.end();
    process.exit(0);
});

process.once('SIGTERM', () => {
    console.log('\n🛑 Cerrando aplicación...');
    bot.stop('SIGTERM');
    if (pool) pool.end();
    process.exit(0);
});

// Iniciar la aplicación
start();