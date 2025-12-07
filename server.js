// server.js

const express = require('express');
const cors = require('cors');
const app = express();
const port = 3000; // 서버가 실행될 포트 번호

// --- 미들웨어 설정 ---
app.use(cors()); // 모든 도메인에서의 요청을 허용 (CORS 문제 해결)
app.use(express.json()); // 클라이언트가 보낸 JSON 데이터를 파싱하기 위함

// --- 데이터베이스를 대신할 임시 주문 데이터 저장소 (메모리) ---
// 서버가 재시작되면 데이터는 초기화됩니다.
let orders = [];
let orderIdCounter = 1; // 주문 번호를 생성하기 위한 카운터

// --- API 엔드포인트 정의 ---

/**
 * [API] 새 주문 접수
 * 클라이언트(주문 페이지)에서 '주문하기'를 누르면 이 API가 호출됩니다.
 */
app.post('/api/orders', (req, res) => {
    // 클라이언트가 보낸 주문 정보를 req.body에서 추출
    const { quantity, name, phone, address, totalAmount } = req.body;

    // 간단한 유효성 검사
    if (!quantity || !name || !phone || !address || !totalAmount) {
        return res.status(400).json({ message: '모든 필수 정보가 전송되지 않았습니다.' });
    }

    // 새 주문 객체 생성
    const newOrder = {
        id: orderIdCounter++,
        productName: '코유산균',
        quantity,
        name,
        phone,
        address,
        totalAmount,
        status: '배송 준비 중', // 주문 초기 상태
        orderDate: new Date().toLocaleString('ko-KR') // 주문 시각 기록
    };

    orders.push(newOrder); // 주문 목록에 새 주문 추가
    console.log('✅ 새 주문이 접수되었습니다:', newOrder);

    // 클라이언트에 성공 응답 전송
    res.status(201).json({ message: '주문이 성공적으로 접수되었습니다.', order: newOrder });
});

/**
 * [API] 전체 주문 목록 조회
 * 관리자 페이지(admin.html)에서 모든 주문을 가져갈 때 사용합니다.
 */
app.get('/api/orders', (req, res) => {
    // 최신 주문이 가장 위에 보이도록 배열을 뒤집어서 전송
    res.json(orders.slice().reverse());
});

/**
 * [API] 주문 상태 변경 (배송 완료 처리)
 * 관리자 페이지에서 '배송 완료' 버튼을 누르면 호출됩니다.
 */
app.patch('/api/orders/:id/complete', (req, res) => {
    const orderId = parseInt(req.params.id, 10);
    const orderToUpdate = orders.find(o => o.id === orderId);

    if (orderToUpdate) {
        orderToUpdate.status = '배송 완료';
        console.log(`🚚 주문 #${orderId}의 상태가 '배송 완료'로 변경되었습니다.`);
        res.status(200).json(orderToUpdate);
    } else {
        res.status(404).json({ message: '해당 ID의 주문을 찾을 수 없습니다.' });
    }
});


// --- 서버 실행 ---
app.listen(port, () => {
    console.log(`🚀 주문 관리 서버가 http://localhost:${port} 에서 실행 중입니다.`);
    console.log("서버를 중지하려면 터미널에서 Ctrl + C 를 누르세요.");
});
