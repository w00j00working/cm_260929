'use client';
// TRPG 리뷰 게시판 (v2.1 사용자 요청 — "간단하게 별점을 매기고 한줄 평가를 적는 형태").
// 시나리오마다 글 하나 — 페어별 말머리(환경설정 > 게시판 관리) · TRPG 룰 · 롤(GM/PC) · 별점(둘이 따로 매길 수 있다) · 본문(한줄 평).
// 글은 콘텐츠 컬렉션 trpg_reviews — 쓴 사람과 관리자만 고치고 지운다 (다른 게시판과 같은 규칙).
import type { Visibility } from './charStore';

export interface TrpgReview {
  /** 소속 섹션 (여러 개로 만들었을 때). 없으면 기본 게시판 */
  secId?: string;
  id: string;
  title: string;             // 시나리오 이름 (글 제목)
  category: string;          // 페어 말머리 — 환경설정 > 게시판 관리의 TRPG 리뷰 말머리 중 하나 (없으면 빈 값)
  rule: string;              // TRPG 룰
  role: 'GM' | 'PC' | '';    // 롤
  stars: number;             // 별점 1 (1~5)
  stars2?: number;           // 별점 2 (1~5) — 둘이 따로 매길 때 (선택)
  body: string;              // 한줄 평·본문 (HTML)
  playDate?: string;         // 플레이한 날 (선택, YYYY-MM-DD)
  date: string;              // 등록 ISO
  author: string;
  authorId: string;
  visibility: Visibility;
}

export const REVIEW_KEY = 'ohome.treview.v1';
export const REVIEW_SEED: TrpgReview[] = [];

/** 별점 글자 — ★★★★☆ */
export const starText = (n: number): string => {
  const k = Math.max(0, Math.min(5, Math.round(n)));
  return '★'.repeat(k) + '☆'.repeat(5 - k);
};

/** 본문에서 태그를 뺀 한 줄 — 목록의 한줄 평 */
export const reviewExcerpt = (html: string): string =>
  html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
