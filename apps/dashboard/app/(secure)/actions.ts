'use server';

import { markItemDone, reopenItem, setEntityImportance, snoozeItem } from '@cortex/db';
import { revalidatePath } from 'next/cache';
import { requireOperator } from '@/lib/auth';

export async function doneAction(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id') ?? '');
  if (id) await markItemDone(id);
  revalidatePath('/');
}

export async function snoozeAction(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id') ?? '');
  const hours = Number(formData.get('hours') ?? 24) || 24;
  if (id) await snoozeItem(id, new Date(Date.now() + hours * 60 * 60 * 1000));
  revalidatePath('/');
}

export async function reopenAction(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id') ?? '');
  if (id) await reopenItem(id);
  revalidatePath('/');
}

export async function importanceAction(formData: FormData): Promise<void> {
  await requireOperator();
  const entityId = String(formData.get('entityId') ?? '');
  const importance = Number(formData.get('importance') ?? 1);
  if (entityId) await setEntityImportance(entityId, importance);
  revalidatePath(`/inspect/${String(formData.get('itemId') ?? '')}`);
}
