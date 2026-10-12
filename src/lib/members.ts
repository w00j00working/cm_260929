'use client';
// 회원 목록 (v2.0) — 서버 모드면 DB의 회원 프로필, 아니면 브라우저 계정
import { useEffect, useState } from 'react';
import { backend, isServerMode } from './backend';

export interface MemberLite {
  id: string; nickname: string; role?: 'admin' | 'member';
  /** 프로필 사진·단색 (v2.1 — 다이어리 오너 칸 머리에 각자 정한 사진을 보여 주기 위해) */
  avatarUrl?: string; avatarColor?: string;
}

/** 로컬(브라우저) 계정 목록 — 서버 없이 개발할 때 */
export function memberPool(): MemberLite[] {
  const base: MemberLite[] = [
    { id: 'admin', nickname: '관리자' },
    { id: 'guest', nickname: '지인회원' },
  ];
  try {
    const reg = JSON.parse(localStorage.getItem('ohome.mockreg.v1') ?? '{}') as
      Record<string, { user?: MemberLite }>;
    for (const k of Object.keys(reg)) {
      const u = reg[k]?.user;
      if (!u) continue;
      const hit = base.find(b => b.id === u.id);
      // 기본 계정(admin·guest)도 마이페이지에서 사진을 정했으면 그 사진을 (v2.1)
      if (hit) { hit.avatarUrl = u.avatarUrl; hit.avatarColor = u.avatarColor; if (u.nickname) hit.nickname = u.nickname; }
      else base.push({ id: u.id, nickname: u.nickname, avatarUrl: u.avatarUrl, avatarColor: u.avatarColor });
    }
  } catch { /* 무시 */ }
  return base;
}

/** 회원 목록에서 관리자 id들 — 서버 모드는 role로, 브라우저 저장 모드는 목업 'admin' (role이 없다) (JN 이식) */
export const adminIdsOf = (members: MemberLite[]): string[] =>
  members.filter(m => m.role === 'admin' || (!m.role && m.id === 'admin')).map(m => m.id);

/** 화면에서 쓰는 회원 목록 — 서버 모드에서는 가입 회원을 DB에서 가져온다 */
export function useMembers(): MemberLite[] {
  const [list, setList] = useState<MemberLite[]>(() => (isServerMode() ? [] : memberPool()));
  useEffect(() => {
    const be = backend();
    if (!isServerMode() || !be) { setList(memberPool()); return; }
    let alive = true;
    be.listMembers()
      .then(rows => { if (alive) setList(rows.map(r => ({ id: r.id, nickname: r.nickname, role: r.role, avatarUrl: r.avatarUrl }))); })
      .catch(() => { /* 권한·네트워크 문제면 빈 목록 */ });
    return () => { alive = false; };
  }, []);
  return list;
}
