## 1. Data Model

- [x] 1.1 [P0] Add `ChatMessage` Prisma model with User/Video relations, indexes, and cascade deletion
- [x] 1.2 [P0] Add database migration for the new `chat_messages` table

## 2. API

- [x] 2.1 [P0] Add `GET /api/videos/[id]/chat` to return the current user's video chat history
- [x] 2.2 [P0] Extend `POST /api/chat` to accept `videoId` and persist completed user/assistant turns for authenticated users
- [x] 2.3 [P0] Reuse existing UserVideo ownership checks before reading or saving chat history

## 3. Frontend

- [x] 3.1 [P0] Track the current database video id in the analyze page for saved/history videos
- [x] 3.2 [P0] Load chat history when a saved video is selected and isolate messages between videos
- [x] 3.3 [P0] Send `videoId` with chat requests when persistence is available
- [x] 3.4 [P1] Keep temporary chat behavior unchanged for anonymous or unsaved videos

## 4. Verification

- [x] 4.1 [P0] Run Prisma generate/build checks
- [ ] 4.2 [P1] Manually verify chat history restores after switching away and back to the same history video
