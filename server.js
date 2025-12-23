const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

// 1. 환경 변수 선언
const port = process.env.PORT || 3000;
const databaseUrl = process.env.DATABASE_URL;

const app = express();

// --- 미들웨어 설정 ---
app.use(cors());
app.use(express.json());

// Debug logging (enabled when DEBUG=true in env)
const DEBUG = process.env.DEBUG === 'true' || false;
// Instance identifier to distinguish between multiple instances
const INSTANCE_ID = process.env.INSTANCE_ID || `${process.pid}-${Math.random().toString(36).slice(2,8)}`;
// Always expose instance id in responses so we can correlate which instance handled the request
app.use((req, res, next) => {
    res.setHeader('X-Instance-Id', INSTANCE_ID);
    next();
});

// Conditional verbose request logging when DEBUG=true
if (DEBUG) {
    app.use((req, res, next) => {
        try {
            const forwarded = req.headers['x-forwarded-for'] || req.connection.remoteAddress || '';
            console.log(`[${new Date().toISOString()}] INCOMING [instance:${INSTANCE_ID}] ${req.method} ${req.originalUrl} - host: ${req.headers.host} ip: ${forwarded} params: ${JSON.stringify(req.params || {})} body: ${JSON.stringify(req.body || {})}`);
        } catch (e) {
            console.log('DEBUG LOG ERROR', e);
        }
        next();
    });
} 

// Serve HTML pages with injected SERVER_URL (production sets process.env.SERVER_URL).
// This keeps the client default as relative paths while allowing the server to inject
// a canonical API host when deployed (no need to edit source or comment out lines).
function injectServerUrl(html) {
    const serverUrl = process.env.SERVER_URL || '';
    return html.replace(/<body([^>]*)>/i, (match, attrs) => {
        if (/data-server-url=/.test(attrs)) {
            return `<body${attrs.replace(/data-server-url=("[^"]*"|'[^']*'|[^\s>]*)/, `data-server-url="${serverUrl}"`)}>`;
        } else {
            return `<body${attrs} data-server-url="${serverUrl}">`;
        }
    });
}

// Debug status endpoint (safe-ish): shows whether DEBUG is true and whether memory store is used
app.get('/_debug/status', (req, res) => {
    return res.json({
        instanceId: INSTANCE_ID,
        pid: process.pid,
        nodeEnv: process.env.NODE_ENV || null,
        debug: DEBUG,
        useMemoryStore: useMemoryStore,
        serverUrlInjected: !!process.env.SERVER_URL,
        envSample: {
            SERVER_URL: process.env.SERVER_URL || null
        }
    });
});

// Serve the main order page with injected config
app.get(['/','/order_page.html'], (req, res) => {
    const file = path.join(__dirname, 'public', 'order_page.html');
    fs.readFile(file, 'utf8', (err, data) => {
        if (err) return res.status(500).send('서버 오류: 주문 페이지를 불러올 수 없습니다.');
        return res.send(injectServerUrl(data));
    });
});

// Serve admin page with injected config
app.get('/admin_page.html', (req, res) => {
    const file = path.join(__dirname, 'public', 'admin_page.html');
    fs.readFile(file, 'utf8', (err, data) => {
        if (err) return res.status(500).send('서버 오류: 관리자 페이지를 불러올 수 없습니다.');
        return res.send(injectServerUrl(data));
    });
});

// Static assets (CSS/JS/images)
app.use(express.static(path.join(__dirname, 'public')));

// 🔴 [수정] 데이터베이스 풀(pool) 변수만 선언하고, 아직 생성하지 않습니다.
let pool;
// If DB is unavailable, use an in-memory fallback so the app can run locally without PostgreSQL.
let useMemoryStore = false;
let memoryOrders = [];
let memoryNextId = 1;

// --- API 엔드포인트 ---
// (API 라우트 코드는 변경 없이 그대로 둡니다)

// [GET] 루트 URL 접속 시 주문 페이지로 리다이렉트 (사용자 경험 개선)
app.get('/', (req, res) => {
    res.redirect('/order_page.html');
});

// [POST] 새 주문 접수
app.post('/api/orders', async (req, res) => {
    if (DEBUG) console.log('HANDLER POST /api/orders', { body: req.body });
    const { quantity, name, phone, address, totalAmount } = req.body;
    if (!quantity || !name || !phone || !address || !totalAmount) {
        return res.status(400).json({ message: '모든 필수 정보가 전송되지 않았습니다.' });
    }
    try {
        if (!useMemoryStore) {
            const result = await pool.query(
                `INSERT INTO orders (product_name, quantity, buyer_name, phone, address, total_amount)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                ['코유산균', quantity, name, phone, address, totalAmount]
            );
            res.status(201).json(result.rows[0]);
        } else {
            const newOrder = {
                id: memoryNextId++,
                product_name: '코유산균',
                quantity: Number(quantity),
                buyer_name: name,
                phone,
                address,
                total_amount: totalAmount,
                status: '배송 준비 중',
                tracking_number: null,
                tracking_carrier: null,
                cancellation_reason: null,
                order_date: new Date().toISOString()
            };
            memoryOrders.push(newOrder);
            res.status(201).json(newOrder);
        }
    } catch (err) {
        console.error('Error saving order:', err.stack || err);
        res.status(500).json({ message: '주문 저장에 실패했습니다.' });
    }
});

// [GET] 전체 주문 목록 조회
app.get('/api/orders', async (req, res) => {
    try {
        if (!useMemoryStore) {
            const result = await pool.query('SELECT * FROM orders ORDER BY order_date DESC');
            res.json(result.rows);
        } else {
            // 메모리 저장소는 최신순으로 정렬해서 반환
            const rows = memoryOrders.slice().sort((a, b) => new Date(b.order_date) - new Date(a.order_date));
            res.json(rows);
        }
    } catch (err) {
        console.error('Error fetching orders:', err.stack || err);
        res.status(500).json({ message: '주문 목록 조회에 실패했습니다.' });
    }
});

// [PATCH] 주문 상태 변경
app.patch('/api/orders/:id/complete', async (req, res) => {
    // Minimal info log for all instances to trace attempts
    console.info(`[${new Date().toISOString()}] ATTEMPT COMPLETE [instance:${INSTANCE_ID}]`, { params: req.params, body: req.body });
    if (DEBUG) console.log('HANDLER PATCH /api/orders/:id/complete', { params: req.params, body: req.body });
    try {
        const id = parseInt(req.params.id, 10);
        const { trackingNumber, carrier } = req.body || {}; 
        if (!useMemoryStore) {
            if (trackingNumber || carrier) {
                const result = await pool.query(
                    `UPDATE orders SET status = '배송 완료', tracking_number = $2, tracking_carrier = $3 WHERE id = $1 RETURNING *`,
                    [id, trackingNumber || null, carrier || null]
                );
                if (result.rows.length > 0) return res.status(200).json(result.rows[0]);
            } else {
                const result = await pool.query(
                    `UPDATE orders SET status = '배송 완료' WHERE id = $1 RETURNING *`,
                    [id]
                );
                if (result.rows.length > 0) return res.status(200).json(result.rows[0]);
            }
            res.status(404).json({ message: '해당 ID의 주문을 찾을 수 없습니다.' });
        } else {
            const order = memoryOrders.find(o => o.id === id);
            if (order) {
                order.status = '배송 완료';
                if (trackingNumber) order.tracking_number = trackingNumber;
                if (carrier) order.tracking_carrier = carrier;
                res.status(200).json(order);
            } else {
                res.status(404).json({ message: '해당 ID의 주문을 찾을 수 없습니다.' });
            }
        }
    } catch (err) {
        console.error('Error updating order status:', err.stack || err);
        // Return more info when DEBUG is enabled
        res.status(500).json({ message: DEBUG ? (err.message || err.stack || '주문 상태 업데이트 중 예외가 발생했습니다.') : '주문 상태 업데이트에 실패했습니다.' });
    }
});

// [PATCH] 취소 요청 접수 (사용자 요청)
app.patch('/api/orders/:id/cancel-request', async (req, res) => {
    console.info(`[${new Date().toISOString()}] ATTEMPT CANCEL-REQUEST [instance:${INSTANCE_ID}]`, { params: req.params, body: req.body });
    if (DEBUG) console.log('HANDLER PATCH /api/orders/:id/cancel-request', { params: req.params, body: req.body });
    try {
        const id = parseInt(req.params.id, 10);
        const reason = (req.body && req.body.reason) ? req.body.reason : ''; 
        if (!useMemoryStore) {
            const result = await pool.query(
                `UPDATE orders SET status = '취소 요청', cancellation_reason = $2 WHERE id = $1 RETURNING *`,
                [id, reason]
            );
            if (result.rows.length > 0) {
                res.status(200).json(result.rows[0]);
            } else {
                res.status(404).json({ message: '해당 ID의 주문을 찾을 수 없습니다.' });
            }
        } else {
            const order = memoryOrders.find(o => o.id === id);
            if (order) {
                order.status = '취소 요청';
                order.cancellation_reason = reason;
                res.status(200).json(order);
            } else {
                res.status(404).json({ message: '해당 ID의 주문을 찾을 수 없습니다.' });
            }
        }
    } catch (err) {
        console.error('Error setting cancel request:', err.stack || err);
        res.status(500).json({ message: DEBUG ? (err.message || err.stack || '취소 요청 처리 중 예외가 발생했습니다.') : '취소 요청 처리에 실패했습니다.' });
    }
});

// [PATCH] 관리자 취소 처리: 주문을 '취소 완료'로 변경하고(선택적으로 사유 저장)
app.patch('/api/orders/:id/cancel', async (req, res) => {
    console.info(`[${new Date().toISOString()}] ATTEMPT CANCEL [instance:${INSTANCE_ID}]`, { params: req.params, body: req.body });
    if (DEBUG) console.log('HANDLER PATCH /api/orders/:id/cancel', { params: req.params, body: req.body });
    try {
        const id = parseInt(req.params.id, 10);
        const reason = (req.body && req.body.reason) ? req.body.reason : null;
        if (!useMemoryStore) {
            const result = await pool.query(
                `UPDATE orders SET status = '취소 완료', cancellation_reason = COALESCE($2, cancellation_reason) WHERE id = $1 RETURNING *`,
                [id, reason]
            );
            if (result.rows.length > 0) {
                res.status(200).json(result.rows[0]);
            } else {
                res.status(404).json({ message: '해당 ID의 주문을 찾을 수 없습니다.' });
            }
        } else {
            const order = memoryOrders.find(o => o.id === id);
            if (order) {
                order.status = '취소 완료';
                if (reason) order.cancellation_reason = reason;
                res.status(200).json(order);
            } else {
                res.status(404).json({ message: '해당 ID의 주문을 찾을 수 없습니다.' });
            }
        }
    } catch (err) {
        console.error('Error cancelling order:', err.stack || err);
        res.status(500).json({ message: DEBUG ? (err.message || err.stack || '주문 취소 처리 중 예외가 발생했습니다.') : '주문 취소 처리에 실패했습니다.' });
    }
});

// [DELETE] 개별 주문 삭제
app.delete('/api/orders/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!useMemoryStore) {
            const result = await pool.query('DELETE FROM orders WHERE id = $1', [id]);
            if (result.rowCount > 0) {
                res.status(200).json({ message: '주문이 성공적으로 삭제되었습니다.' });
            } else {
                res.status(404).json({ message: '해당 ID의 주문을 찾을 수 없습니다.' });
            }
        } else {
            const index = memoryOrders.findIndex(o => o.id === id);
            if (index >= 0) {
                memoryOrders.splice(index, 1);
                res.status(200).json({ message: '주문이 성공적으로 삭제되었습니다.' });
            } else {
                res.status(404).json({ message: '해당 ID의 주문을 찾을 수 없습니다.' });
            }
        }
    } catch (err) {
        console.error('Error deleting order:', err.stack || err);
        res.status(500).json({ message: '주문 삭제에 실패했습니다.' });
    }
});

// [DELETE] 모든 주문 삭제
app.delete('/api/orders/all', async (req, res) => {
    try {
        if (!useMemoryStore) {
            await pool.query('TRUNCATE TABLE orders RESTART IDENTITY');
            console.log('🗑️ 모든 주문 데이터가 초기화되었습니다.');
            res.status(200).json({ message: '모든 주문 정보가 성공적으로 초기화되었습니다.' });
        } else {
            memoryOrders = [];
            memoryNextId = 1;
            console.log('🗑️ 모든 주문 데이터(메모리)가 초기화되었습니다.');
            res.status(200).json({ message: '모든 주문 정보가 성공적으로 초기화되었습니다. (메모리)' });
        }
    } catch (err) {
        console.error('Error truncating orders table:', err.stack || err);
        res.status(500).json({ message: '데이터베이스 초기화에 실패했습니다.' });
    }
});


// --- 서버 시작 및 DB 초기화 함수 ---
const startServer = async () => {
    try {
        if (databaseUrl) {
            // 시도: 데이터베이스 연결
            pool = new Pool({
                connectionString: databaseUrl,
                ssl: { rejectUnauthorized: false }
            });

            console.log('DEBUG: 1. 데이터베이스 연결 시도 중...');
            try {
                const client = await pool.connect();
                console.log('✅ PostgreSQL 데이터베이스에 성공적으로 연결되었습니다.');

                console.log('DEBUG: 2. "orders" 테이블 생성/확인 시도 중...');
                await client.query(`
                    CREATE TABLE IF NOT EXISTS orders (
                        id SERIAL PRIMARY KEY,
                        product_name VARCHAR(255) NOT NULL,
                        quantity INTEGER NOT NULL,
                        buyer_name VARCHAR(255) NOT NULL,
                        phone VARCHAR(255) NOT NULL,
                        address TEXT NOT NULL,
                        total_amount VARCHAR(255) NOT NULL,
                        status VARCHAR(50) DEFAULT '배송 준비 중',
                        tracking_number VARCHAR(255),
                        tracking_carrier VARCHAR(255),
                        cancellation_reason TEXT,
                        order_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                `);
                console.log('✅ "orders" 테이블이 준비되었습니다.');
                client.release();
            } catch (dbErr) {
                console.error('⚠️ PostgreSQL 연결/초기화 실패, 메모리 스토어로 폴백합니다.', dbErr.message || dbErr.stack || dbErr);
                useMemoryStore = true;
            }
        } else {
            console.log('INFO: DATABASE_URL 미설정. 메모리 스토어로 동작합니다.');
            useMemoryStore = true;
        }

        console.log('DEBUG: 서버 시작 중...');
        console.log('DEBUG mode:', DEBUG, 'PORT:', port, 'USE_MEMORY_STORE:', useMemoryStore);
        app.listen(port, () => {
            console.log(`🚀 서버가 포트 ${port}번에서 실행 중입니다. 사용 모드: ${useMemoryStore ? '메모리 스토어(개발용)' : 'PostgreSQL'}`);
        });

    } catch (err) {
        console.error('❌ 서버 시작 실패: 예기치 않은 오류가 발생했습니다.', err.stack || err);
        process.exit(1);
    }
};

// --- 전역 에러 핸들러: JSON 파싱 등 미처리 예외를 잡아 로깅하고 JSON 응답을 반환합니다. ---
app.use((err, req, res, next) => {
    console.error('Global error handler:', err.stack || err);
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ message: DEBUG ? (err.message || '잘못된 JSON') : '잘못된 요청입니다.' });
    }
    res.status(500).json({ message: DEBUG ? (err.message || err.stack || '서버 내부 오류') : '서버 오류가 발생했습니다.' });
});

// --- 애플리케이션 실행 ---
startServer();
