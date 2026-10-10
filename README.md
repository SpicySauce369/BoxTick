# BoxTick

포켓몬 카드 및 카드 박스의 샘플 시세를 조회하고 사용자들이 정보를 공유할 수 있는 과제용 커뮤니티 웹사이트입니다.

## 실행 환경

- **Node.js 22 이상**
- 첫 설치 시 `npm install`을 위해 인터넷 연결이 필요합니다.
- 설치가 끝난 뒤 사이트 실행 자체에는 외부 시세 API나 CDN이 필요하지 않습니다.
- 데이터는 로컬 SQLite 파일(`data/boxtick.db`)에 저장됩니다.

## 빠른 실행

처음 실행할 때:

```bash
npm install
npm run db:init
npm start
```

브라우저에서 `http://localhost:3000`을 엽니다.

- `npm run db:init`: DB 생성 + 관리자 계정 + 샘플 데이터 입력
- `npm start`: 웹 서버 실행
- `npm test`: node:test + supertest 전체 테스트 (선택)

`db:init`은 여러 번 실행해도 seed 데이터가 중복되지 않도록 구성되어 있습니다.

## 시연 계정

| 구분 | 아이디 | 비밀번호 |
|------|--------|----------|
| 관리자 | `admin` | `admin1234` |
| 일반 회원 | `ash01` | `test1234!` |

추가 일반 회원: `brock`, `dawn`, `gary`, `misty` (비밀번호 모두 `test1234!`)

직접 회원가입한 계정도 동일한 SQLite DB에 저장되며 로그인·마이페이지·게시판 기능을 사용할 수 있습니다.

## Tech Stack

- Node.js
- Express
- SQLite (`better-sqlite3`)
- HTML / CSS / Vanilla JavaScript
- 직접 구현한 SVG 시세 차트
- `express-session` 기반 세션 인증

## 주요 기능

- 회원가입 / 로그인 / 로그아웃
- 사용자 / 관리자 권한 구분
- 카드 목록·검색·상세 시세 조회
- 박스 목록·상세 시세 조회
- 가격 변동 SVG 그래프
- 게시판 / 댓글
- 마이페이지
- 관리자 회원·게시글·세트·카드·시세 관리

## 환경변수

| 환경변수 | 기본값 | 설명 |
|----------|--------|------|
| `PORT` | `3000` | 서버 포트 |
| `DB_PATH` | `data/boxtick.db` | SQLite 파일 경로 |
| `SESSION_SECRET` | (임시 랜덤값) | 세션 서명 키. `NODE_ENV=production`이면 필수 |
| `ADMIN_USERNAME` | `admin` | 초기 관리자 아이디 |
| `ADMIN_PASSWORD` | `admin1234` | 초기 관리자 비밀번호 |
| `ADMIN_NICKNAME` | `관리자` | 초기 관리자 닉네임 |

## 샘플 데이터

`npm run db:init` 기준:

- 카드 세트 3개
- 카드 24개
- 카드·박스 시세 이력
- 게시글 16개
- 댓글 28개

시세 데이터는 기능 구현 및 시연을 위한 샘플이며 실제 거래 가격이 아닙니다.
