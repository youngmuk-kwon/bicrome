// server.js

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

// ... (환경 변수 선언 부분은 그대로 둡니다)
const port = process.env.PORT || 3000;
const databaseUrl = process.env.DATABASE_URL;

const app = express();

// --- 미들웨어 설정 ---
app.use(cors());
app.use(express.json());

// ✅ [수정] 이 코드를 여기에 추가하세요.
// 'public' 폴더를 정적 파일 제공을 위한 루트로 지정합니다.
app.use(express.static(path.join(__dirname, 'public')));

// --- 데이터베이스 풀 생성 ---
// (이하 코드는 모두 훌륭하므로 그대로 둡니다)
// ...
