const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

// 1. 환경 변수를 최상단에서 선언하고 사용합니다.
const port = process.env.PORT || 3000;
const databaseUrl = process.env.DATABASE_URL;

const app = express();

// --- 미들웨어 설정 ---
app.use(cors());
app.use(express.json());

// --- 데이터베이스 풀 생성 ---
// databaseUrl이 없는 경우를 대비하여 빈 객체를 전달, 오류를 방지합니다.
const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl ? { rejectUnauthorized: false } : false // Render 환경에서만 SSL 적용
});

// --- API 엔드포인트 ---

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
        // 서버가 시작되기 전에 DB 연결 및 테이블 생성을 시도합니다.
        const client = await pool.connect();
        console.log('✅ PostgreSQL 데이터베이스에 성공적으로 연결되었습니다.');
        
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

        // 모든 준비가 끝나면 서버를 시작합니다.
        app.listen(port, () => {
            console.log(`🚀 서버가 포트 ${port}번에서 실행 중입니다.`);
        });

    } catch (err) {
        console.error('❌ 서버 시작 실패: 데이터베이스 초기화 중 오류 발생.', err.stack);
        // 초기화 실패 시 서버를 시작하지 않고 프로세스를 종료합니다.
        // 이 경우, Render 로그에 명확한 오류가 남고 재시작 루프를 방지할 수 있습니다.
        process.exit(1);
    }
};

// --- 애플리케이션 실행 ---
startServer();
