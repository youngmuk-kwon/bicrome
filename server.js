// server.js (PostgreSQL 연동 버전)

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg'); // PostgreSQL 클라이언트 라이브러리 임포트
const app = express();
const port = 3000;

// --- 미들웨어 설정 ---
app.use(cors());
app.use(express.json());

// --- PostgreSQL 데이터베이스 연결 설정 ---
// Render 환경에서는 process.env.DATABASE_URL 환경 변수에 DB URL이 자동으로 주입됩니다.
// 로컬 테스트 시에는 직접 DB URL을 여기에 넣거나, .env 파일을 사용해야 합니다.
const databaseUrl = process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/mydatabase'; // 로컬 테스트용 기본값 (실제 DB 정보로 변경 필요)

const pool = new Pool({
    connectionString: databaseUrl,
    ssl: {
        rejectUnauthorized: false // Render PostgreSQL은 SSL을 사용하므로 필요
    }
});

// 데이터베이스 연결 테스트 및 테이블 생성 함수
async function connectDbAndCreateTable() {
    try {
        const client = await pool.connect();
        console.log('✅ PostgreSQL 데이터베이스에 성공적으로 연결되었습니다.');

        // orders 테이블이 없으면 생성
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
        client.release(); // 클라이언트 반환
    } catch (err) {
        console.error('❌ 데이터베이스 연결 또는 테이블 생성 중 오류 발생:', err.message);
        // 서버 시작을 중단할 수도 있습니다.
        process.exit(1);
    }
}

// 서버 시작 전에 DB 연결 및 테이블 생성 시도
connectDbAndCreateTable();


// --- API 엔드포인트 정의 ---

/**
 * [API] 새 주문 접수
 */
app.post('/api/orders', async (req, res) => {
    const { quantity, name, phone, address, totalAmount } = req.body;

    if (!quantity || !name || !phone || !address || !totalAmount) {
        return res.status(400).json({ message: '모든 필수 정보가 전송되지 않았습니다.' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO orders (product_name, quantity, buyer_name, phone, address, total_amount, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            ['코유산균', quantity, name, phone, address, totalAmount, '배송 준비 중']
        );
        const newOrder = result.rows[0];
        console.log('✅ 새 주문이 데이터베이스에 저장되었습니다:', newOrder);
        res.status(201).json({ message: '주문이 성공적으로 접수되었습니다.', order: newOrder });
    } catch (err) {
        console.error('❌ 주문 저장 중 오류 발생:', err.message);
        res.status(500).json({ message: '주문 저장에 실패했습니다.' });
    }
});

/**
 * [API] 전체 주문 목록 조회
 */
app.get('/api/orders', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM orders ORDER BY order_date DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('❌ 주문 목록 조회 중 오류 발생:', err.message);
        res.status(500).json({ message: '주문 목록 조회에 실패했습니다.' });
    }
});

/**
 * [API] 주문 상태 변경 (배송 완료 처리)
 */
app.patch('/api/orders/:id/complete', async (req, res) => {
    const orderId = parseInt(req.params.id, 10);

    try {
        const result = await pool.query(
            `UPDATE orders SET status = '배송 완료' WHERE id = $1 RETURNING *`,
            [orderId]
        );

        if (result.rows.length > 0) {
            const updatedOrder = result.rows[0];
            console.log(`🚚 주문 #${orderId}의 상태가 '배송 완료'로 변경되었습니다.`);
            res.status(200).json(updatedOrder);
        } else {
            res.status(404).json({ message: '해당 ID의 주문을 찾을 수 없습니다.' });
        }
    } catch (err) {
        console.error('❌ 주문 상태 업데이트 중 오류 발생:', err.message);
        res.status(500).json({ message: '주문 상태 업데이트에 실패했습니다.' });
    }
});


// --- 서버 실행 ---
app.listen(port, () => {
    console.log(`🚀 주문 관리 서버가 http://localhost:${port} 에서 실행 중입니다.`);
    console.log("서버를 중지하려면 터미널에서 Ctrl + C 를 누르세요.");
});
