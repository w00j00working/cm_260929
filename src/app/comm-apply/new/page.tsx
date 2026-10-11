'use client';
// 신청자 등록 (4.18) — 페이지형
import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList, newId } from '@/lib/postStore';
import { Applicant, APPLY_SEED, CommItem, COMM_SEED, useCommSettings } from '@/lib/commStore';
import { ApplicantForm } from '@/components/comm/ApplicantForm';
import { useToast } from '@/components/ui/Toast';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';

export default function ApplicantNewPage() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [apps, setApps] = useLocalList<Applicant>('ohome.commapply.v1', APPLY_SEED);
  const [comms] = useLocalList<CommItem>('ohome.comm.v1', COMM_SEED);
  const [settings] = useCommSettings();

  if (!isAdmin) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>APPLICANTS</PageTitle><p>관리자 전용 페이지</p></div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head"><PageTitle>ADD APPLICANT</PageTitle><EditableDesc k="commapply-new-desc" def="신청자 등록" /></div>
      <ApplicantForm initial={null} comms={comms} settings={settings}
        onCancel={() => router.push('/comm-apply')}
        onSave={v => {
          setApps([...apps, { id: newId(), ...v }]);
          toast('신청자가 등록되었습니다');
          router.push('/comm-apply');
        }} />
    </section>
  );
}
