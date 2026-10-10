# BoxTick
(과제용)
포켓몬 카드 및 카드 박스의 시세를 조회하고
사용자들이 정보를 공유할 수 있는 커뮤니티형 웹사이트

## Tech Stack

- Node.js
- Express
- SQLite
- HTML / CSS / JavaScript
- Chart.js

## 주요 기능

- 회원가입 / 로그인
- 사용자 / 관리자 권한 구분
- 카드 및 박스 시세 조회
- 가격 변동 그래프
- 게시판 / 댓글
- 관리자 페이지

## 실행 방법

Node.js 20 이상이 필요합니다.

```bash
npm install
npm run db:init   # data/boxtick.db 생성 + 관리자 계정(admin / admin1234) 생성
npm start         # http://localhost:3000
npm test          # node:test + supertest
```

| 환경변수 | 기본값 | 설명 |
|----------|--------|------|
| `PORT` | `3000` | 서버 포트 |
| `DB_PATH` | `data/boxtick.db` | SQLite 파일 경로 |
| `SESSION_SECRET` | (임시 랜덤값) | 세션 서명 키. `NODE_ENV=production` 이면 필수 |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_NICKNAME` | `admin` / `admin1234` / `관리자` | `db:init` 이 만드는 초기 관리자 계정 |
