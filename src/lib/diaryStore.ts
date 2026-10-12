// 다이어리 (4.14) — 무드 일기 + 무드 리스트 (환경설정 관리)
// v2.1: 구분 탭 — 탭을 여러 개 만들고 탭마다 자관이나 AU를 연동한다. 연동하지 않은 탭은 오너의 일기
import { useCallback, useEffect, useState } from 'react';
import type { Visibility } from './charStore';
import { getRawSetting, setSetting } from './settingStore';

/* ---------- 무드 (5.2 — 환경설정에서 이름/아이콘/색 관리) ---------- */
export interface Mood {
  id: string;
  name: string;
  icon: string;      // 이모지/특수문자 1~2자
  color: string;     // 아이콘 색 (배경은 자동 틴트)
}

/** 무드는 처음부터 비어 있다 (v2.0) — 예시 4종은 프로토타입 잔재라 환경설정에서 직접 만든다 */
export const MOOD_SEED: Mood[] = [];

/* ---------- 일기 ---------- */
export interface DiaryPost {
  /** 소속 섹션 (v2.0) — 여러 개로 만들었을 때. 없으면 기본 섹션 */
  secId?: string;
  id: string;
  title: string;
  date: string;              // YYYY-MM-DD
  moodId: string;
  body: string;              // MD
  imgIds: string[];          // 첨부 이미지 (IndexedDB)
  visibility: Visibility;
  /** 쓴 회원 (v2.1 — 환경설정 「권한」에서 회원에게도 일기를 열 수 있게 되면서) · 수정·삭제는 본인과 관리자 */
  authorId?: string;
  /** 구분 탭 (v2.1 — 환경설정 > 다이어리에서 관리) — 없으면 구분 없음 */
  catId?: string;
  /** 누구의 일기인지 (v2.1 — 자관을 연동한 탭) — 그 자관의 멤버 캐릭터 id. 페어 자관이면 이 값으로 왼쪽/오른쪽 칸이 갈린다 */
  charId?: string;
  /** 쓴 시각 (ISO, v2.1) — 같은 날짜의 일기를 쓴 순서대로 놓기 위해. 없는 옛 일기는 id에 든 시각으로 */
  createdAt?: string;
}

export const DIARY_SEED: DiaryPost[] = [];

/** 쓴 시각 (ms) — createdAt이 없는 옛 일기는 id 앞부분(newId가 넣는 36진수 시각)으로 */
export function diaryWrittenAt(p: DiaryPost): number {
  if (p.createdAt) { const t = Date.parse(p.createdAt); if (Number.isFinite(t)) return t; }
  const n = parseInt(p.id.slice(0, 8), 36);
  return Number.isFinite(n) ? n : 0;
}
/** 목록 순서 — 일기 날짜(최신이 위), 같은 날이면 쓴 순서(나중에 쓴 것이 위).
 *  날짜만으로는 같은 날 일기의 순서가 저장 순서에 달려 있어, 두 사람이 각자 저장할 때마다 뒤바뀔 수 있다 (v2.1) */
export const diaryOrder = (a: DiaryPost, b: DiaryPost) =>
  b.date.localeCompare(a.date) || diaryWrittenAt(b) - diaryWrittenAt(a);

/* ---------- 구분 탭 (v2.1 사용자 요청 — 탭을 여러 개 만들 수 있는 형식, 환경설정 > 다이어리에서 관리) ---------- */
/** 구분 탭. link(`relId:auId` — auId가 'base'면 자관 원본)를 정하면 그 탭은 그 자관/AU의 일기가 된다 —
 *  탭 머리에 그 모습의 캐릭터가 보이고, 그 자관 캐릭터에 권한을 받은 회원도 쓸 수 있다. 정하지 않으면 오너의 일기 */
export interface DiaryCat {
  id: string; name: string;
  /** 쓰는 사람 (v2.1 사용자 요청) — owner: 오너(+상대 오너)끼리 · char: 자관/AU의 캐릭터로. 없으면 link가 있을 때만 char */
  mode?: 'owner' | 'char';
  /** 오너 탭의 왼쪽·오른쪽 사람(회원 id) (v2.1 사용자 요청 — 누가 어느 쪽에 갈지 고른다). 둘 다 정하면 두 칸 */
  leftId?: string;
  rightId?: string;
  /** (옛 설정) 상대 오너 — leftId/rightId가 없을 때 오른쪽으로 읽는다 */
  partnerId?: string;
  /** 캐릭터 탭의 자관/AU (`relId:auId`) */
  link?: string;
}
/** 오너 탭의 왼쪽·오른쪽 사람 — 옛 설정(partnerId만)은 왼쪽 오너(adminId), 오른쪽 상대 */
export function ownerSides(c: DiaryCat | undefined, adminId: string): { l?: string; r?: string } {
  if (!c) return {};
  const r = c.rightId || c.partnerId || undefined;
  const l = c.leftId || (r ? adminId : undefined);
  return { l, r };
}
/** 탭 방식 — 옛 설정(mode 없음)은 link가 있으면 캐릭터, 아니면 오너 */
export const diaryCatMode = (c?: DiaryCat): 'owner' | 'char' => c?.mode ?? (c?.link ? 'char' : 'owner');
export interface DiarySettings { cats: DiaryCat[] }
export const DEFAULT_DIARY_SETTINGS: DiarySettings = { cats: [] };

const SET_KEY = 'ohome.diaryset.v1';

/** 연동 값 풀기 — `relId:auId`. 옛 값(자관 id만)은 원본으로 */
export function parseDiaryLink(link?: string): { relId: string; auId: string } | null {
  if (!link) return null;
  const i = link.indexOf(':');
  return i < 0 ? { relId: link, auId: 'base' } : { relId: link.slice(0, i), auId: link.slice(i + 1) };
}

export function useDiarySettings(): [DiarySettings, (patch: Partial<DiarySettings>) => void, boolean] {
  const [st, setSt] = useState<DiarySettings>(DEFAULT_DIARY_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = getRawSetting(SET_KEY);
      if (raw) setSt({ ...DEFAULT_DIARY_SETTINGS, ...JSON.parse(raw) });
    } catch { /* 기본값 */ }
    setLoaded(true);
  }, []);
  const patch = useCallback((p: Partial<DiarySettings>) => {
    setSt(s => {
      const n = { ...s, ...p };
      try { setSetting(SET_KEY, n); } catch { /* 무시 */ }
      return n;
    });
  }, []);
  return [st, patch, loaded];
}

/** hex(#rrggbb) → 옅은 틴트 배경 (아이콘 원 배경용) */
export const moodTint = (hex: string) => /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}26` : 'rgba(127,127,127,.15)';
