'use client';

import { useEffect, useMemo, useState } from 'react';
import { useUser } from '@/context/UserContext';
import {
  addWorkspaceMember,
  createInvitation,
  fetchWorkspaceDetail,
  listInvitations,
  removeWorkspaceMember,
  revokeInvitation,
  updateWorkspaceMember,
} from '@/lib/documents';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import ConfirmModal from '@/components/ui/ConfirmModal';
import type { WorkspaceDetail, WorkspaceMember, WorkspaceInvitation, WorkspaceUserRole } from '@/types';

const ROLE_ORDER: WorkspaceUserRole[] = ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'];

const ROLE_BADGE: Record<WorkspaceUserRole, { label: string; class: string }> = {
  OWNER:  { label: 'Owner',  class: 'bg-purple-100 text-purple-700' },
  ADMIN:  { label: 'Admin',  class: 'bg-blue-100 text-blue-700' },
  EDITOR: { label: 'Editor', class: 'bg-green-100 text-green-700' },
  VIEWER: { label: 'Viewer', class: 'bg-surface-high text-ink-2' },
};

function initials(firstName: string, lastName: string) {
  return `${firstName[0]}${lastName[0]}`.toUpperCase();
}

/** Returns a color-coded expiry label: red if ≤2 days, amber if ≤7 days, gray otherwise. */
function expiryBadge(expiresAt: string): { label: string; class: string } {
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
  if (days <= 0)  return { label: 'Expired',        class: 'bg-red-100 text-red-700' };
  if (days === 1) return { label: 'Expires tomorrow', class: 'bg-red-100 text-red-700' };
  if (days <= 3)  return { label: `${days} days left`, class: 'bg-red-100 text-red-700' };
  if (days <= 7)  return { label: `${days} days left`, class: 'bg-amber-100 text-amber-700' };
  return {
    label: new Date(expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    class: 'bg-surface-high text-ink-3',
  };
}

export default function MembersPage() {
  const { activeWorkspace, user, isLoading: userLoading } = useUser();
  const toast = useToast();
  const [detail, setDetail] = useState<WorkspaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [editingMember, setEditingMember] = useState<WorkspaceMember | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<WorkspaceMember | null>(null);
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

  const canManage =
    activeWorkspace?.role === 'OWNER' || activeWorkspace?.role === 'ADMIN';

  function load(workspaceId: string, silent = false) {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    fetchWorkspaceDetail(workspaceId)
      .then(setDetail)
      .catch((e) => { if (!silent) setError('Failed to load members.'); void e; })
      .finally(() => { if (!silent) setLoading(false); });
    // Also refresh pending invitations if admin/owner
    if (canManage) {
      listInvitations(workspaceId)
        .then(setInvitations)
        .catch(() => {});
    }
  }

  useEffect(() => {
    if (!activeWorkspace) return;
    load(activeWorkspace.workspaceId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace?.workspaceId]);

  async function confirmRemove() {
    if (!activeWorkspace || !pendingRemove) return;
    setRemovingId(pendingRemove.id);
    setPendingRemove(null);
    try {
      await removeWorkspaceMember(activeWorkspace.workspaceId, pendingRemove.id);
      toast.success(`${pendingRemove.firstName} ${pendingRemove.lastName} removed.`);
      load(activeWorkspace.workspaceId, true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove member.');
    } finally {
      setRemovingId(null);
    }
  }

  if (userLoading || loading) return <PageSkeleton />;

  if (!activeWorkspace) {
    return <div className="text-sm text-ink-3 p-4">No active workspace selected.</div>;
  }

  if (error || !detail) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 px-5 py-4 text-sm text-red-700">
        {error ?? 'Could not load members.'}
      </div>
    );
  }

  const sortedMembers = [...detail.members].sort(
    (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role),
  );

  function copyInviteLink(invId: string, token: string) {
    const link = `${window.location.origin}/join/${token}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedInviteId(invId);
      setTimeout(() => setCopiedInviteId(null), 2000);
    }).catch(() => {});
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="page-title">Members</h1>
        <p className="page-subtitle">
          {detail.name} &middot; {detail.memberCount} member{detail.memberCount !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-ink-2 flex items-center gap-2">
            Active Members
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-brand-100 text-brand-700">
              {sortedMembers.length}
            </span>
          </h2>
          <p className="text-xs text-ink-3 mt-0.5">Roles control what each person can see and do</p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stroke text-sm font-medium text-ink-2 hover:bg-surface-high hover:border-ink-3 active:scale-[0.97] transition-all duration-150 flex-shrink-0"
          >
            <span className="text-base leading-none">+</span>
            Add
          </button>
        )}
      </div>

      <div className="bg-surface rounded-xl border border-stroke overflow-hidden">
        <div className="divide-y divide-stroke-soft">
          {sortedMembers.map((member) => {
            const badge = ROLE_BADGE[member.role];
            const joined = new Date(member.joinedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });
            const isYou = member.userId === user?.id;
            const isOwner = member.role === 'OWNER';

            return (
              <div key={member.id} className="flex items-center gap-4 px-5 py-4 hover:bg-surface-high transition-all duration-100 group">
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center text-xs font-semibold text-brand-700 flex-shrink-0">
                  {initials(member.firstName, member.lastName)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {member.firstName} {member.lastName}
                    {isYou && (
                      <span className="ml-1.5 text-xs text-ink-3 font-normal">(you)</span>
                    )}
                  </p>
                  <p className="text-xs text-ink-3 truncate">{member.email}</p>
                </div>

                {/* Role badge */}
                <span className={cn('flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded', badge.class)}>
                  {badge.label}
                </span>

                {/* Joined */}
                <span className="flex-shrink-0 text-xs text-ink-3 hidden sm:block">
                  Joined {joined}
                </span>

                {/* Actions — fixed width so role badge + joined date stay aligned across all rows */}
                {canManage && !isYou && (activeWorkspace?.role === 'OWNER' || !isOwner) ? (
                  <div className="flex items-center justify-end gap-1.5 flex-shrink-0 w-[152px]">
                    <button
                      onClick={() => setEditingMember(member)}
                      className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-stroke text-ink-2 hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50 transition-colors"
                    >
                      <PencilIcon />
                      Edit
                    </button>
                    {!isOwner && (
                      <button
                        onClick={() => setPendingRemove(member)}
                        disabled={!!removingId}
                        className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-stroke text-ink-2 hover:border-red-300 hover:text-red-700 hover:bg-red-50 transition-colors disabled:opacity-40"
                      >
                        {removingId === member.id ? (
                          <svg className="animate-spin" width="11" height="11" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <TrashIcon />
                        )}
                        {removingId === member.id ? 'Removing…' : 'Remove'}
                      </button>
                    )}
                  </div>
                ) : (
                  /* No actions — same fixed width keeps preceding columns aligned */
                  <div className="w-[152px] flex-shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Pending Invitations — always visible to admins so they know the section exists */}
      {canManage && (
        <div className="mt-10">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-ink-2 flex items-center gap-2">
                Pending Invitations
                {invitations.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                    {invitations.length}
                  </span>
                )}
              </h2>
              <p className="text-xs text-ink-3 mt-0.5">Invited users appear here until they accept</p>
            </div>
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white dark:bg-brand-400 dark:text-slate-900 text-sm font-semibold hover:bg-slate-800 dark:hover:bg-brand-300 active:scale-[0.97] transition-all duration-150 flex-shrink-0"
            >
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
                <line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
              </svg>
              Invite
            </button>
          </div>

          <div className="bg-surface rounded-xl border border-stroke overflow-hidden">
            {invitations.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <div className="w-10 h-10 rounded-full bg-surface-high border border-stroke flex items-center justify-center mx-auto mb-3">
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" className="text-ink-3">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                    <line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
                  </svg>
                </div>
                <p className="text-sm text-ink-3 font-medium">No pending invitations</p>
                <p className="text-xs text-ink-3 mt-1">Send an invite link to bring people into this workspace</p>
              </div>
            ) : (
              <div className="divide-y divide-stroke-soft">
                {invitations.map((inv) => {
                  const isRevoking = revokingId === inv.id;
                  const isCopied = copiedInviteId === inv.id;
                  const invBadge = ROLE_BADGE[inv.role];
                  const expiry = expiryBadge(inv.expiresAt);

                  return (
                    <div key={inv.id} className="flex items-center gap-4 px-5 py-4 hover:bg-surface-high transition-colors">
                      {/* Avatar */}
                      <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-xs font-bold text-amber-700 flex-shrink-0">
                        {inv.email[0]?.toUpperCase() ?? '?'}
                      </div>

                      {/* Email + meta */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink truncate">{inv.email}</p>
                        <p className="text-xs text-ink-3 mt-0.5">
                          Invited by {inv.createdBy.firstName} {inv.createdBy.lastName}
                        </p>
                      </div>

                      {/* Role badge */}
                      <span className={cn('text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0', invBadge.class)}>
                        {invBadge.label}
                      </span>

                      {/* Expiry badge — color-coded urgency */}
                      <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded flex-shrink-0 hidden sm:inline', expiry.class)}>
                        {expiry.label}
                      </span>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => copyInviteLink(inv.id, inv.token)}
                          disabled={isRevoking}
                          className={cn(
                            'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-40',
                            isCopied
                              ? 'border-green-200 text-green-700 bg-green-50'
                              : 'border-stroke text-ink-2 hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50',
                          )}
                        >
                          {isCopied ? (
                            <>
                              <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              Copied!
                            </>
                          ) : (
                            <>
                              <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <rect x="9" y="9" width="13" height="13" rx="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                              </svg>
                              Copy link
                            </>
                          )}
                        </button>

                        <button
                          onClick={async () => {
                            if (!activeWorkspace) return;
                            setRevokingId(inv.id);
                            try {
                              await revokeInvitation(activeWorkspace.workspaceId, inv.id);
                              setInvitations((prev) => prev.filter((i) => i.id !== inv.id));
                              toast.success(`Invitation to ${inv.email} revoked.`);
                            } catch {
                              toast.error('Failed to revoke invitation.');
                            } finally {
                              setRevokingId(null);
                            }
                          }}
                          disabled={isRevoking}
                          className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-stroke text-ink-2 hover:border-red-300 hover:text-red-700 hover:bg-red-50 transition-colors disabled:opacity-40"
                        >
                          {isRevoking ? (
                            <svg className="animate-spin" width="11" height="11" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          ) : (
                            <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          )}
                          {isRevoking ? 'Revoking…' : 'Revoke'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {showInviteModal && (
        <InviteModal
          workspaceId={activeWorkspace.workspaceId}
          onClose={() => setShowInviteModal(false)}
          onInvited={(inv) => {
            setInvitations((prev) => [inv, ...prev.filter((i) => i.id !== inv.id)]);
          }}
        />
      )}

      {showAddModal && (
        <AddMemberModal
          workspaceId={activeWorkspace.workspaceId}
          currentUserRole={activeWorkspace.role}
          onClose={() => setShowAddModal(false)}
          onAdded={() => {
            setShowAddModal(false);
            load(activeWorkspace.workspaceId, true);
            toast.success('Member added to workspace.');
          }}
        />
      )}

      {editingMember && (
        <EditRoleModal
          workspaceId={activeWorkspace.workspaceId}
          member={editingMember}
          currentUserRole={activeWorkspace.role}
          onClose={() => setEditingMember(null)}
          onSaved={() => {
            setEditingMember(null);
            load(activeWorkspace.workspaceId, true);
            toast.success('Member updated.');
          }}
        />
      )}

      {pendingRemove && (
        <ConfirmModal
          title="Remove member"
          body={`${pendingRemove.firstName} ${pendingRemove.lastName} will lose access to this workspace immediately.`}
          confirmLabel="Remove Member"
          danger
          loading={removingId === pendingRemove.id}
          onConfirm={confirmRemove}
          onClose={() => setPendingRemove(null)}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ //
// Edit Role Modal
// ------------------------------------------------------------------ //

function EditRoleModal({
  workspaceId,
  member,
  currentUserRole,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  member: WorkspaceMember;
  /** Role of the admin performing the edit — controls which roles can be assigned */
  currentUserRole: WorkspaceUserRole;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [firstName, setFirstName] = useState(member.firstName);
  const [lastName, setLastName] = useState(member.lastName);
  const [email, setEmail] = useState(member.email);
  const [role, setRole] = useState<WorkspaceUserRole>(member.role);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty = useMemo(
    () =>
      role !== member.role ||
      firstName.trim() !== member.firstName ||
      lastName.trim() !== member.lastName ||
      email.trim() !== member.email,
    [role, firstName, lastName, email, member.role, member.firstName, member.lastName, member.email],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setError('First and last name are required.');
      return;
    }
    if (!email.trim()) {
      setError('Email is required.');
      return;
    }
    if (!isDirty) { onClose(); return; }

    setSubmitting(true);
    setError(null);
    try {
      await updateWorkspaceMember(workspaceId, member.id, {
        role,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        ...(email.trim() !== member.email && { email: email.trim() }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update member.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-backdrop">
      <div className="bg-surface rounded-xl border border-stroke shadow-xl w-full max-w-sm mx-4 p-6 animate-in">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-ink">Edit Member</h2>
          <button onClick={onClose} className="text-ink-3 hover:text-ink-2 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">First name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                className="w-full h-9 rounded-lg border border-stroke bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">Last name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                className="w-full h-9 rounded-lg border border-stroke bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full h-9 rounded-lg border border-stroke bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="member@example.com"
            />
            <p className="text-[10px] text-ink-3 mt-0.5">Changing email affects this user globally across all workspaces.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as WorkspaceUserRole)}
              className="w-full h-9 rounded-lg border border-stroke bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="VIEWER">Viewer — can view and download shared documents</option>
              <option value="EDITOR">Editor — can upload and edit documents</option>
              <option value="ADMIN">Admin — can manage members and settings</option>
              {/* Only workspace Owners can assign or transfer the Owner role */}
              {currentUserRole === 'OWNER' && (
                <option value="OWNER">Owner — full control</option>
              )}
            </select>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-ink-2 border border-stroke rounded-lg hover:bg-surface-high">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !isDirty}
              title={!isDirty ? 'No changes to save' : undefined}
              className="px-4 py-2 text-sm font-semibold bg-slate-900 text-white dark:bg-brand-400 dark:text-slate-900 rounded-lg hover:bg-slate-800 dark:hover:bg-brand-300 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Add Member Modal
// ------------------------------------------------------------------ //

function AddMemberModal({
  workspaceId,
  currentUserRole,
  onClose,
  onAdded,
}: {
  workspaceId: string;
  currentUserRole: WorkspaceUserRole;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<WorkspaceUserRole>('VIEWER');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await addWorkspaceMember(workspaceId, { email, firstName, lastName, role });
      onAdded();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add member.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-backdrop">
      <div className="bg-surface rounded-xl border border-stroke shadow-xl w-full max-w-md mx-4 p-6 animate-in">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-ink">Add Member</h2>
          <button onClick={onClose} className="text-ink-3 hover:text-ink-2 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">First name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                className="w-full h-9 rounded-lg border border-stroke bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Alice"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">Last name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                className="w-full h-9 rounded-lg border border-stroke bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Smith"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full h-9 rounded-lg border border-stroke bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="alice@example.com"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as WorkspaceUserRole)}
              className="w-full h-9 rounded-lg border border-stroke bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="VIEWER">Viewer — can view and download documents</option>
              <option value="EDITOR">Editor — can upload and edit documents</option>
              <option value="ADMIN">Admin — can manage members and settings</option>
              {/* Only Owners can assign the Owner role */}
              {currentUserRole === 'OWNER' && (
                <option value="OWNER">Owner — full control</option>
              )}
            </select>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-ink-2 border border-stroke rounded-lg hover:bg-surface-high">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-semibold bg-slate-900 text-white dark:bg-brand-400 dark:text-slate-900 rounded-lg hover:bg-slate-800 dark:hover:bg-brand-300 disabled:opacity-50">
              {submitting ? 'Adding…' : 'Add Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Skeleton + icons
// ------------------------------------------------------------------ //

function PageSkeleton() {
  return (
    <div className="max-w-3xl animate-pulse">
      <div className="h-7 w-32 bg-stroke rounded mb-2" />
      <div className="h-4 w-48 bg-surface-high rounded mb-6" />
      <div className="bg-surface rounded-xl border border-stroke overflow-hidden divide-y divide-stroke-soft">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <div className="w-9 h-9 rounded-full bg-surface-high" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-36 bg-stroke rounded" />
              <div className="h-3 w-48 bg-surface-high rounded" />
            </div>
            <div className="h-5 w-14 bg-surface-high rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

function PencilIcon() {
  return (
    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

// ------------------------------------------------------------------ //
// Invite Modal
// ------------------------------------------------------------------ //

function InviteModal({
  workspaceId,
  onClose,
  onInvited,
}: {
  workspaceId: string;
  onClose: () => void;
  onInvited: (inv: WorkspaceInvitation) => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceUserRole>('VIEWER');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<WorkspaceInvitation | null>(null);

  function resetForm() {
    setCreated(null);
    setEmail('');
    setRole('VIEWER');
    setError(null);
  }

  const inviteLink = created
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/join/${created.token}`
    : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const inv = await createInvitation(workspaceId, { email: email.trim(), role });
      setCreated(inv);
      onInvited(inv);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create invitation.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-backdrop">
      <div className="bg-surface rounded-xl border border-stroke shadow-xl w-full max-w-md mx-4 p-6 animate-in">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-ink">
            {created ? 'Invitation Created' : 'Invite to Workspace'}
          </h2>
          <button onClick={onClose} className="text-ink-3 hover:text-ink-2 text-xl leading-none transition-colors active:scale-90">&times;</button>
        </div>

        {created && inviteLink ? (
          /* Success — show the invite link */
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Invitation sent to <span className="font-medium">{created.email}</span>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">Share this link</label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={inviteLink}
                  className="flex-1 h-9 rounded-lg border border-stroke bg-surface-high px-3 text-xs text-ink-2 focus:outline-none"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(inviteLink)}
                  className="px-3 py-2 text-xs font-medium text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors"
                >
                  Copy
                </button>
              </div>
              <p className="text-[10px] text-ink-3 mt-1">
                This link expires{' '}
                {new Date(created.expiresAt).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                })}.
              </p>
            </div>
            <div className="flex justify-between gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 text-sm font-medium text-ink-2 border border-stroke rounded-lg hover:bg-surface-high transition-colors"
              >
                Invite another
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold bg-slate-900 text-white dark:bg-brand-400 dark:text-slate-900 rounded-lg hover:bg-slate-800 dark:hover:bg-brand-300 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full h-9 rounded-lg border border-stroke bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="colleague@example.com"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as WorkspaceUserRole)}
                className="w-full h-9 rounded-lg border border-stroke bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="VIEWER">Viewer — can view and download documents</option>
                <option value="EDITOR">Editor — can upload and edit documents</option>
                <option value="ADMIN">Admin — can manage members and settings</option>
              </select>
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-ink-2 border border-stroke rounded-lg hover:bg-surface-high">
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm font-semibold bg-slate-900 text-white dark:bg-brand-400 dark:text-slate-900 rounded-lg hover:bg-slate-800 dark:hover:bg-brand-300 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Sending…' : 'Send Invite'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
