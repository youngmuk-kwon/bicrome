const startServer = async () => {
    try {
        console.log('DEBUG: 1. 데이터베이스 연결 시도 중...'); // 👈 이 로그 추가
        const client = await pool.connect();
        console.log('✅ PostgreSQL 데이터베이스에 성공적으로 연결되었습니다.');
        
        console.log('DEBUG: 2. "orders" 테이블 생성/확인 시도 중...'); // 👈 이 로그 추가
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

        console.log('DEBUG: 3. 데이터베이스 초기화 완료. 서버 시작 중...'); // 👈 이 로그 추가
        app.listen(port, () => {
            console.log(`🚀 서버가 포트 ${port}번에서 실행 중입니다.`);
        });

    } catch (err) {
        console.error('❌ 서버 시작 실패: 데이터베이스 초기화 중 오류 발생.', err.stack);
        process.exit(1);
    }
};
