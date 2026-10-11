'use client';
// 일기 쓰기 (4.14) — 페이지형
// v2.1: 섹션(?s=)과 보고 있던 구분 탭(?cat=)을 따라간다 · 구분 탭에 연동한 자관 캐릭터에 권한을 받은 회원도 그 탭에 쓴다
import React, { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useMenuSettings, canWriteAt, writeKeyOf, writeDefaultOf } from '@/lib/menuStore';
import { useLocalList, newId } from '@/lib/postStore';
import { DiaryPost, DIARY_SEED, Mood, MOOD_SEED, useDiarySettings, parseDiaryLink } from '@/lib/diaryStore';
import { Character, CHAR_SEED, Relation, REL_SEED, hasRelGrant } from '@/lib/charStore';
import { useSectionParam, secStamp, sectionHref } from '@/lib/sectionStore';
import { DiaryForm } from '@/components/diary/DiaryForm';
import { useToast } from '@/components/ui/Toast';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';

function DiaryWriteInner() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [posts, setPosts] = useLocalList<DiaryPost>('ohome.diary.v1', DIARY_SEED);
  const [moods] = useLocalList<Mood>('ohome.moods.v1', MOOD_SEED);
  const [chars] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);
  const [rels] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);
  const [dset, , dsetLoaded] = useDiarySettings();
  // 어느 다이어리에서 눌러 왔는지 (v2.1 — 예전에는 늘 기본 다이어리에 들어갔다)
  const sec = useSectionParam('diary');
  const sp = useSearchParams();
  const wantCat = sp.get('cat') ?? undefined;   // 보고 있던 구분 탭
  const listHref = sectionHref('diary', sec.id);
  // 글쓰기 권한 (v2.1) — 환경설정 「권한」에서 (기본: 관리자) · WRITE 버튼과 같은 판정으로 주소 직접 진입도 막는다
  const [menuSet, , menuLoaded] = useMenuSettings();

  if (!menuLoaded || !dsetLoaded) return <section className="page" />;
  const viewer = { loggedIn: !!user, isAdmin, id: user?.id };
  const canWriteGeneral = canWriteAt(menuSet, writeKeyOf('/diary', sec.id), viewer, writeDefaultOf('/diary'));
  // 구분 탭에 연동한 자관의 캐릭터에 권한을 받은 회원은 권한 설정과 무관하게 그 탭에 쓴다 (v2.1 — 두 사람이 같이 쓰는 일기)
  const linkedGrant = (link?: string) => {
    const l = parseDiaryLink(link);
    const rel = l ? rels.find(r => r.id === l.relId) : undefined;
    return !!user && !!rel && hasRelGrant(rel.members, chars, user.id);
  };
  const writableCats = canWriteGeneral ? dset.cats : dset.cats.filter(c => linkedGrant(c.link));
  if (!user || (!canWriteGeneral && writableCats.length === 0)) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href={listHref}>DIARY</PageTitle><p>허용된 회원만 일기를 쓸 수 있습니다</p></div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head"><PageTitle href={listHref}>WRITE DIARY</PageTitle><EditableDesc k="diary-write-desc" def="일기 쓰기" /></div>
      <DiaryForm initial={null} moods={moods} cats={writableCats} initialCatId={wantCat}
        onCancel={() => router.push(listHref)}
        onSave={v => {
          // 쓴 사람·시각을 남긴다 (v2.1) — 수정·삭제 권한과 같은 날 일기의 순서에 쓴다
          const p: DiaryPost = { id: newId(), ...v, authorId: user.id, createdAt: new Date().toISOString(), ...secStamp(sec.id) };
          setPosts([p, ...posts]);
          toast('일기가 등록되었습니다');
          router.push(listHref);
        }} />
    </section>
  );
}

/** ?s=·?cat= 를 읽으므로 Suspense 경계가 필요하다 (Next App Router) */
export default function DiaryWritePage() {
  return <Suspense fallback={<section className="page" />}><DiaryWriteInner /></Suspense>;
}
