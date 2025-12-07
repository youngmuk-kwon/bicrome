const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

// 1. 환경 변수 선언
const port = process.env.PORT || 3000;
const databaseUrl = process.env.DATABASE_URL;

const app = express();

// --- 미들웨어 설정 ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 🔴 [수정] 데이터베이스 풀(pool) 변수만 선언하고, 아직 생성하지 않습니다.
let pool;

// --- API 엔드포인트 ---
// (API 라우트 코드는 변경 없이 그대로 둡니다)

// [GET] 루트 URL 접속 시 주문 페이지로 리다이렉트 (사용자 경험 개선)
app.get('/', (req, res) => {
    res.redirect('/order_page.html');
});

// [POST] 새 주문 접수
app.post('/api/orders', async (req, res) => {
    const { quantity, name, phone, address, totalAmount } = req.body;
    if (!quantity || !name || !phone || !address || !totalAmount) {
        return res.status(400).json({ message: '모든 필수 정보가 전송되지 않았습니다.' });
    }
    try {
        const result = await pool.query(
            `INSERT INTO orders (product_name, quantity, buyer_name, phone, address, total_amount)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            ['코유산균', quantity, name, phone, address, totalAmount]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error saving order:', err.stack);
        res.status(500).json({ message: '주문 저장에 실패했습니다.' });
    }
});

// [GET] 전체 주문 목록 조회
app.get('/api/orders', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM orders ORDER BY order_date DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching orders:', err.stack);
        res.status(500).json({ message: '주문 목록 조회에 실패했습니다.' });
    }
});

// [PATCH] 주문 상태 변경
app.patch('/api/orders/:id/complete', async (req, res) => {
    try {
        const result = await pool.query(
            `UPDATE orders SET status = '배송 완료' WHERE id = $1 RETURNING *`,
            [req.params.id]
        );
        if (result.rows.length > 0) {
            res.status(200).json(result.rows[0]);
        } else {
            res.status(404).json({ message: '해당 ID의 주문을 찾을 수 없습니다.' });
        }
    } catch (err) {
        console.error('Error updating order status:', err.stack);
        res.status(500).json({ message: '주문 상태 업데이트에 실패했습니다.' });
    }
});

// [DELETE] 개별 주문 삭제
app.delete('/api/orders/:id', async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
        if (result.rowCount > 0) {
            res.status(200).json({ message: '주문이 성공적으로 삭제되었습니다.' });
        } else {
            res.status(404).json({ message: '해당 ID의 주문을 찾을 수 없습니다.' });
        }
    } catch (err) {
        console.error('Error deleting order:', err.stack);
        res.status(500).json({ message: '주문 삭제에 실패했습니다.' });
    }
});

// [DELETE] 모든 주문 삭제
app.delete('/api/orders/all', async (req, res) => {
    try {
        await pool.query('TRUNCATE TABLE orders RESTART IDENTITY');
        console.log('🗑️ 모든 주문 데이터가 초기화되었습니다.');
        res.status(200).json({ message: '모든 주문 정보가 성공적으로 초기화되었습니다.' });
    } catch (err) {
        console.error('Error truncating orders table:', err.stack);
        res.status(500).json({ message: '데이터베이스 초기화에 실패했습니다.' });
    }
});


// --- 서버 시작 및 DB 초기화 함수 ---
const startServer = async () => {
    try {
        // ✅ [수정] 이 함수 안에서 데이터베이스 풀(pool)을 생성하고 초기화합니다.
        pool = new Pool({
            connectionString: databaseUrl,
            ssl: databaseUrl ? { rejectUnauthorized: false } : false
        });

        console.log('DEBUG: 1. 데이터베이스 연결 시도 중...');
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
                order_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ "orders" 테이블이 준비되었습니다.');
        client.release();

        console.log('DEBUG: 3. 데이터베이스 초기화 완료. 서버 시작 중...');
        app.listen(port, () => {
            console.log(`🚀 서버가 포트 ${port}번에서 실행 중입니다.`);
        });

    } catch (err) {
        console.error('❌ 서버 시작 실패: 데이터베이스 초기화 중 오류 발생.', err.stack);
        process.exit(1);
    }
};

// --- 애플리케이션 실행 ---
startServer();
