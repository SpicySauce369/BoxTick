const express = require('express');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// 이 라우터의 모든 API 는 관리자 전용이다.
// 카드·세트·시세 관리 API 를 여기에 추가한다. 회원 관리는 routes/adminUsers.js.
router.use(requireAdmin);

module.exports = router;
