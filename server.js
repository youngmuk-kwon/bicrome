// server.js (삭제 기능 추가 버전)

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const databaseUrl = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: databaseUrl,
    ssl: {
        rejectUnauthorized: false
    }
});

// DB 연결 및 테이블 생성 (이전과 동일)
async function connectDbAndCreateTable() {
    try {
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
    } catch (err) {
        console.error('❌ 데이터베이스 연결 또는 테이블 생성 중 오류 발생:', err.message);
        process.exit(1);
    }
}
connectDbAndCreateTable();

// --- API 엔드포인트 ---

// [POST] 새 주문 접수 (이전과 동일)
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
        res.status(500).json({ message: '주문 저장에 실패했습니다.' });
    }
});

// [GET] 전체 주문 목록 조회 (이전과 동일)
app.get('/api/orders', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM orders ORDER BY order_date DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: '주문 목록 조회에 실패했습니다.' });
    }
});

// [PATCH] 주문 상태 변경 (이전과 동일)
app.patch('/api/orders/:id/complete', async (req, res) => {
    try {
        const result = await pool.query(
            `UPDATE orders SET status = '배송 완료' WHERE id = $1 RETURNING *`,
            [req.params.id]
        );
        if (result.rows.length > 0) res.status(200).json(result.rows[0]);
        else res.status(404).json({ message: '해당 ID의 주문을 찾을 수 없습니다.' });
    } catch (err) {
        res.status(500).json({ message: '주문 상태 업데이트에 실패했습니다.' });
    }
});

/********************************************/
/*      [DELETE] 개별 주문 삭제 API (추가됨)    */
/********************************************/
app.delete('/api/orders/:id', async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
        if (result.rowCount > 0) {
            res.status(200).json({ message: '주문이 성공적으로 삭제되었습니다.' });
        } else {
            res.status(404).json({ message: '해당 ID의 주문을 찾을 수 없습니다.' });
        }
    } catch (err) {
        console.error('❌ 주문 삭제 중 오류 발생:', err.message);
        res.status(500).json({ message: '주문 삭제에 실패했습니다.' });
    }
});

/********************************************/
/*      [DELETE] 모든 주문 삭제 API (추가됨)    */
/********************************************/
app.delete('/api/orders/all', async (req, res) => {
    try {
        // TRUNCATE는 테이블의 모든 데이터를 매우 빠르게 삭제하고, SERIAL 카운터도 초기화합니다.
        await pool.query('TRUNCATE TABLE orders RESTART IDENTITY');
        console.log('🗑️ 모든 주문 데이터가 초기화되었습니다.');
        res.status(200).json({ message: '모든 주문 정보가 성공적으로 초기화되었습니다.' });
    } catch (err) {
        console.error('❌ DB 초기화 중 오류 발생:', err.message);
        res.status(500).json({ message: '데이터베이스 초기화에 실패했습니다.' });
    }
});

// --- 서버 실행 ---
app.listen(port, () => {
    console.log(`🚀 주문 관리 서버가 http://localhost:${port} 에서 실행 중입니다.`);
});
