const express = require('express');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// 이 라우터의 모든 API 는 관리자 전용이다.
// 공통 관리자 라우터. 회원 관리는 adminUsers.js, 카드·세트·시세는 adminCatalog.js.
router.use(requireAdmin);

module.exports = router;
