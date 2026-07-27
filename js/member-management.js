/**
 * Member Management Module
 * Owner-only UI for managing store members and invite codes.
 *
 * Security:
 * - owner-only access enforced via isOwner() check
 * - sensitive identifiers never written to logs
 * - invite codes never written to logs
 * - email values are masked from RPC return (list_store_members already masks)
 * - privileged credentials never used in browser context
 */
(function (global) {
    'use strict';

    function getClient() {
        if (!global.LESOULSupabase || !global.LESOULSupabase.getClient) {
            throw new Error(t('members', 'supabase_not_initialized'));
        }
        return global.LESOULSupabase.getClient();
    }

    function isOwner() {
        var bootstrap = global.LESOULAppBootstrap;
        if (!bootstrap || !bootstrap.getContext) return false;
        var ctx = bootstrap.getContext();
        if (!ctx || !ctx.activeMembership) return false;
        return ctx.activeMembership.role === 'owner';
    }

    // ================================================================
    // Service functions
    // ================================================================

    async function listStoreMembers() {
        var client = getClient();
        var result = await client.rpc('list_store_members');
        if (result.error) throw new Error(result.error.message || t('members', 'member_list_error'));
        return result.data || [];
    }

    async function deactivateStoreMember(memberId) {
        if (!memberId) throw new Error(t('members', 'member_id_required'));
        var client = getClient();
        var result = await client.rpc('deactivate_store_member', { p_member_id: memberId });
        if (result.error) throw new Error(result.error.message || t('members', 'member_deactivate_failed'));
        return result.data;
    }

    async function generateStoreInviteCode(role, invitedEmail, expiresInDays) {
        if (role === 'owner') throw new Error(t('members', 'owner_invite_not_allowed'));
        if (role !== 'staff' && role !== 'manager') throw new Error(t('members', 'invite_role_staff_manager_only'));
        var days = parseInt(expiresInDays, 10);
        if (isNaN(days) || days < 1 || days > 30) throw new Error(t('members', 'expires_days_range_error'));
        var client = getClient();
        var result = await client.rpc('generate_store_invite_code', {
            p_role: role,
            p_invited_email: invitedEmail || null,
            p_expires_in_days: days
        });
        if (result.error) throw new Error(result.error.message || t('members', 'invite_code_create_failed'));
        return result.data;
    }

    async function listStoreInviteCodes() {
        var client = getClient();
        var result = await client.rpc('list_store_invite_codes');
        if (result.error) throw new Error(result.error.message || t('members', 'invite_code_list_failed'));
        return result.data || [];
    }

    async function revokeStoreInviteCode(invitationId) {
        if (!invitationId) throw new Error(t('members', 'invite_id_required'));
        var client = getClient();
        var result = await client.rpc('revoke_store_invite_code', { p_invitation_id: invitationId });
        if (result.error) throw new Error(result.error.message || t('members', 'invite_code_revoke_failed'));
        return result.data;
    }

    // ================================================================
    // UI Rendering
    // ================================================================

    function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatDate(dateStr) {
        if (!dateStr) return '-';
        try {
            var d = new Date(dateStr);
            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        } catch (e) {
            return '-';
        }
    }

    function renderAccessDenied() {
        return '<div class="member-mgmt-container">' +
            '<div class="member-mgmt-access-denied">' +
            '<h2><i class="fas fa-lock"></i> ' + t('members', 'access_denied') + '</h2>' +
            '<p>' + t('members', 'owner_only_page') + '</p>' +
            '</div></div>';
    }

    function renderMemberRow(member, currentUserId) {
        var isOwnerRow = member.role === 'owner';
        var isSelf = member.member_id && currentUserId && member.member_id === currentUserId;
        var canDeactivate = !isOwnerRow && !isSelf && member.is_active === true && !!member.member_id;
        var statusBadge = member.is_active
            ? '<span class="status-badge status-active">' + t('members', 'active') + '</span>'
            : '<span class="status-badge status-inactive">' + t('members', 'inactive') + '</span>';
        var roleLabel = member.role === 'owner' ? 'Owner' : (member.role === 'manager' ? 'Manager' : 'Staff');

        var deactivateBtn = canDeactivate
            ? '<button class="btn btn-sm btn-danger" onclick="MemberManagement.confirmDeactivate(\'' + member.member_id + '\')">' + t('members', 'deactivate') + '</button>'
            : '';

        return '<tr>' +
            '<td>' + escapeHtml(member.display_name || '-') + '</td>' +
            '<td>' + escapeHtml(member.masked_email || '-') + '</td>' +
            '<td>' + roleLabel + '</td>' +
            '<td>' + statusBadge + '</td>' +
            '<td>' + formatDate(member.joined_at) + '</td>' +
            '<td>' + deactivateBtn + '</td>' +
            '</tr>';
    }

    function renderInviteRow(invite) {
        var status = invite.status || 'active';
        var statusClass = 'status-' + status;
        var canRevoke = status === 'active' && !invite.used_at && !invite.revoked_at;
        var roleLabel = invite.role === 'owner' ? 'Owner' : (invite.role === 'manager' ? 'Manager' : 'Staff');
        var maskedEmail = invite.invited_email
            ? invite.invited_email.substring(0, 2) + '***' + invite.invited_email.substring(invite.invited_email.indexOf('@'))
            : '-';

        var revokeBtn = canRevoke
            ? '<button class="btn btn-sm btn-warning" onclick="MemberManagement.confirmRevoke(\'' + invite.id + '\')">' + t('members', 'cancel') + '</button>'
            : '';

        return '<tr>' +
            '<td><code class="invite-code-display">' + escapeHtml(invite.invite_code || '-') + '</code></td>' +
            '<td>' + roleLabel + '</td>' +
            '<td>' + maskedEmail + '</td>' +
            '<td><span class="status-badge ' + statusClass + '">' + status + '</span></td>' +
            '<td>' + formatDate(invite.created_at) + '</td>' +
            '<td>' + formatDate(invite.expires_at) + '</td>' +
            '<td>' + revokeBtn + '</td>' +
            '</tr>';
    }

    function renderPage() {
        if (!isOwner()) {
            return renderAccessDenied();
        }

        return '<div class="member-mgmt-container">' +
            '<h2 class="page-title"><i class="fas fa-users-cog"></i> ' + t('members', 'member_invite_management') + '</h2>' +

            '<div class="member-mgmt-card" id="member-list-card">' +
            '<div class="member-mgmt-card-header">' +
            '<h3><i class="fas fa-users"></i> ' + t('members', 'member_list') + '</h3>' +
            '<button class="btn btn-sm btn-secondary" onclick="MemberManagement.refreshMembers()">' + t('members', 'refresh') + '</button>' +
            '</div>' +
            '<div id="member-list-body"><p class="muted-text">' + t('members', 'loading') + '</p></div>' +
            '</div>' +

            '<div class="member-mgmt-card" id="invite-generate-card">' +
            '<div class="member-mgmt-card-header"><h3><i class="fas fa-plus-circle"></i> ' + t('members', 'invite_code_generate') + '</h3></div>' +
            '<div class="invite-generate-form">' +
            '<div class="form-row">' +
            '<label>' + t('members', 'role') + '</label>' +
            '<select id="invite-role-select">' +
            '<option value="staff">Staff</option>' +
            '<option value="manager">Manager</option>' +
            '</select>' +
            '</div>' +
            '<div class="form-row">' +
            '<label>' + t('members', 'invite_email_optional') + '</label>' +
            '<input type="email" id="invite-email-input" placeholder="email@example.com" />' +
            '</div>' +
            '<div class="form-row">' +
            '<label>' + t('members', 'expires_days_label') + '</label>' +
            '<input type="number" id="invite-expires-input" value="7" min="1" max="30" />' +
            '</div>' +
            '<button class="btn btn-primary" id="invite-generate-btn" onclick="MemberManagement.handleGenerateInvite()">' + t('members', 'generate_invite_code') + '</button>' +
            '<div id="invite-generate-result"></div>' +
            '</div>' +
            '</div>' +

            '<div class="member-mgmt-card" id="invite-list-card">' +
            '<div class="member-mgmt-card-header">' +
            '<h3><i class="fas fa-ticket-alt"></i> ' + t('members', 'invite_code_list') + '</h3>' +
            '<button class="btn btn-sm btn-secondary" onclick="MemberManagement.refreshInvites()">' + t('members', 'refresh') + '</button>' +
            '</div>' +
            '<div id="invite-list-body"><p class="muted-text">' + t('members', 'loading') + '</p></div>' +
            '</div>' +

            '</div>';
    }

    // ================================================================
    // UI Actions
    // ================================================================

    async function refreshMembers() {
        var body = document.getElementById('member-list-body');
        if (!body) return;
        body.innerHTML = '<p class="muted-text">' + t('members', 'loading') + '</p>';
        try {
            var members = await listStoreMembers();
            if (members.length === 0) {
                body.innerHTML = '<p class="muted-text">' + t('members', 'no_members') + '</p>';
                return;
            }
            var ctx = global.LESOULAppBootstrap ? global.LESOULAppBootstrap.getContext() : {};
            var currentUserId = ctx.user ? ctx.user.id : null;
            var html = '<table class="member-mgmt-table">' +
                '<thead><tr><th>' + t('members', 'name') + '</th><th>' + t('members', 'email') + '</th><th>' + t('members', 'role') + '</th><th>' + t('members', 'status') + '</th><th>' + t('members', 'joined_at') + '</th><th>' + t('members', 'actions') + '</th></tr></thead>' +
                '<tbody>';
            for (var i = 0; i < members.length; i++) {
                html += renderMemberRow(members[i], currentUserId);
            }
            html += '</tbody></table>';
            body.innerHTML = html;
        } catch (e) {
            body.innerHTML = '<p class="error-text">' + t('members', 'member_list_load_failed') + ': ' + escapeHtml(e.message) + '</p>';
        }
    }

    async function confirmDeactivate(memberId) {
        if (!memberId) return;
        if (!confirm(t('members', 'confirm_deactivate_member'))) return;
        try {
            await deactivateStoreMember(memberId);
            if (global.App && global.App.flash) global.App.flash(t('members', 'member_deactivated'), 'success');
            await refreshMembers();
        } catch (e) {
            if (global.App && global.App.flash) global.App.flash(t('members', 'deactivate_failed') + ': ' + e.message, 'error');
        }
    }

    async function handleGenerateInvite() {
        var roleSelect = document.getElementById('invite-role-select');
        var emailInput = document.getElementById('invite-email-input');
        var expiresInput = document.getElementById('invite-expires-input');
        var resultDiv = document.getElementById('invite-generate-result');
        var btn = document.getElementById('invite-generate-btn');

        if (!roleSelect || !expiresInput) return;
        var role = roleSelect.value;
        var email = emailInput ? emailInput.value.trim() : '';
        var days = parseInt(expiresInput.value, 10);

        if (role === 'owner') {
            if (resultDiv) resultDiv.innerHTML = '<p class="error-text">' + t('members', 'owner_invite_not_allowed') + '</p>';
            return;
        }
        if (isNaN(days) || days < 1 || days > 30) {
            if (resultDiv) resultDiv.innerHTML = '<p class="error-text">' + t('members', 'expires_days_range_error') + '</p>';
            return;
        }

        if (btn) btn.disabled = true;
        if (resultDiv) resultDiv.innerHTML = '<p class="muted-text">' + t('members', 'creating') + '</p>';

        try {
            var code = await generateStoreInviteCode(role, email, days);
            // Show invite code on screen (user needs to copy it)
            // Full value must not be written to logs
            if (resultDiv) {
                resultDiv.innerHTML = '<div class="invite-code-result">' +
                    '<p><strong>' + t('members', 'invite_code_created') + '</strong></p>' +
                    '<div class="invite-code-box">' +
                    '<code id="generated-invite-code">' + escapeHtml(code) + '</code>' +
                    '<button class="btn btn-sm btn-secondary" onclick="MemberManagement.copyInviteCode()">' + t('members', 'copy') + '</button>' +
                    '</div>' +
                    '<p class="muted-text">' + t('members', 'send_code_to_staff') + '</p>' +
                    '</div>';
            }
            await refreshInvites();
        } catch (e) {
            if (resultDiv) resultDiv.innerHTML = '<p class="error-text">' + t('members', 'create_failed') + ': ' + escapeHtml(e.message) + '</p>';
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function copyInviteCode() {
        var codeEl = document.getElementById('generated-invite-code');
        if (!codeEl) return;
        var code = codeEl.textContent;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(code);
        } else {
            var textarea = document.createElement('textarea');
            textarea.value = code;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
        if (global.App && global.App.flash) global.App.flash(t('members', 'invite_code_copied'), 'success');
    }

    async function refreshInvites() {
        var body = document.getElementById('invite-list-body');
        if (!body) return;
        body.innerHTML = '<p class="muted-text">' + t('members', 'loading') + '</p>';
        try {
            var invites = await listStoreInviteCodes();
            if (invites.length === 0) {
                body.innerHTML = '<p class="muted-text">' + t('members', 'no_invite_codes') + '</p>';
                return;
            }
            var html = '<table class="member-mgmt-table">' +
                '<thead><tr><th>' + t('members', 'invite_code') + '</th><th>' + t('members', 'role') + '</th><th>' + t('members', 'email') + '</th><th>' + t('members', 'status') + '</th><th>' + t('members', 'created_at') + '</th><th>' + t('members', 'expires_at') + '</th><th>' + t('members', 'actions') + '</th></tr></thead>' +
                '<tbody>';
            for (var i = 0; i < invites.length; i++) {
                html += renderInviteRow(invites[i]);
            }
            html += '</tbody></table>';
            body.innerHTML = html;
        } catch (e) {
            body.innerHTML = '<p class="error-text">' + t('members', 'invite_code_list_load_failed') + ': ' + escapeHtml(e.message) + '</p>';
        }
    }

    async function confirmRevoke(invitationId) {
        if (!invitationId) return;
        if (!confirm(t('members', 'confirm_revoke_invite'))) return;
        try {
            await revokeStoreInviteCode(invitationId);
            if (global.App && global.App.flash) global.App.flash(t('members', 'invite_code_revoked'), 'success');
            await refreshInvites();
        } catch (e) {
            if (global.App && global.App.flash) global.App.flash(t('members', 'revoke_failed') + ': ' + e.message, 'error');
        }
    }

    async function init() {
        if (!isOwner()) return;
        await Promise.all([refreshMembers(), refreshInvites()]);
    }

    // ================================================================
    // Export
    // ================================================================

    global.MemberManagement = Object.freeze({
        renderPage: renderPage,
        init: init,
        refreshMembers: refreshMembers,
        refreshInvites: refreshInvites,
        confirmDeactivate: confirmDeactivate,
        handleGenerateInvite: handleGenerateInvite,
        copyInviteCode: copyInviteCode,
        confirmRevoke: confirmRevoke,
        // Service functions exposed for testing
        listStoreMembers: listStoreMembers,
        deactivateStoreMember: deactivateStoreMember,
        generateStoreInviteCode: generateStoreInviteCode,
        listStoreInviteCodes: listStoreInviteCodes,
        revokeStoreInviteCode: revokeStoreInviteCode,
        isOwner: isOwner
    });

})(typeof window !== 'undefined' ? window : globalThis);
