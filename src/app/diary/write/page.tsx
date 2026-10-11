'use client';
// 일기 쓰기 (4.14) — 페이지형
import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useMenuSettings, canWriteAt, writeDefaultOf } from '@/lib/menuStore';
import { useLocalList, newId } from '@/lib/postStore';
import { DiaryPost, DIARY_SEED, Mood, MOOD_SEED } from '@/lib/diaryStore';
import { DiaryForm } from '@/components/diary/DiaryForm';
import { useToast } from '@/components/ui/Toast';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';

export default function DiaryWritePage() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [posts, setPosts] = useLocalList<DiaryPost>('ohome.diary.v1', DIARY_SEED);
  const [moods] = useLocalList<Mood>('ohome.moods.v1', MOOD_SEED);
  // 글쓰기 권한 (v2.1) — 환경설정 「권한」에서 (기본: 관리자) · WRITE 버튼과 같은 판정으로 주소 직접 진입도 막는다
  const [menuSet, , menuLoaded] = useMenuSettings();

  if (!menuLoaded) return <section className="page" />;
  if (!user || !canWriteAt(menuSet, '/diary', { loggedIn: true, isAdmin, id: user.id }, writeDefaultOf('/diary'))) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>DIARY</PageTitle><p>허용된 회원만 일기를 쓸 수 있습니다</p></div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head"><PageTitle>WRITE DIARY</PageTitle><EditableDesc k="diary-write-desc" def="일기 쓰기" /></div>
      <DiaryForm initial={null} moods={moods}
        onCancel={() => router.push('/diary')}
        onSave={v => {
          const p: DiaryPost = { id: newId(), ...v, authorId: user.id };   // 쓴 사람을 남긴다 (v2.1)
          setPosts([p, ...posts]);
          toast('일기가 등록되었습니다');
          router.push('/diary');
        }} />
    </section>
  );
}
