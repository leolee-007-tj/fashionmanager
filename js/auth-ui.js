(function (global) {
    'use strict';

    // Auth UI renderer for the feature-flagged auth gate.
    // Security rules:
    //   - Render only into #auth-root.
    //   - Never use innerHTML for dynamic values; use createElement + textContent.
    //   - Never log or persist passwords, tokens, or Supabase raw errors.
    //   - Show only generic Korean error messages on screen.

    var _root = null;
    var _busy = false;
    var _activeListeners = []; // [{ node, type, fn }]

    function _makeError(code, message) {
        var err = new Error(message);
        err.code = code;
        return err;
    }

    function _clear() {
        if (!_root) return;
        // Detach all tracked listeners.
        for (var i = 0; i < _activeListeners.length; i++) {
            var entry = _activeListeners[i];
            try {
                entry.node.removeEventListener(entry.type, entry.fn);
            } catch (e) {
                /* ignore */
            }
        }
        _activeListeners = [];
        // Remove all children.
        while (_root.firstChild) {
            _root.removeChild(_root.firstChild);
        }
    }

    function _on(node, type, fn) {
        node.addEventListener(type, fn);
        _activeListeners.push({ node: node, type: type, fn: fn });
    }

    function _el(tagName, className, text) {
        var node = document.createElement(tagName);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    function _input(type, id, className) {
        var inp = document.createElement('input');
        inp.type = type;
        if (id) inp.id = id;
        if (className) inp.className = className;
        return inp;
    }

    function _label(forId, text) {
        var lbl = document.createElement('label');
        if (forId) lbl.setAttribute('for', forId);
        lbl.textContent = text;
        return lbl;
    }

    function _button(text, className, onClick, type) {
        var btn = document.createElement('button');
        btn.type = type || 'button';
        if (className) btn.className = className;
        btn.textContent = text;
        if (onClick) _on(btn, 'click', onClick);
        return btn;
    }

    function _getBrandName() {
        var stored = localStorage.getItem('lesoul_gh_app_brand_name');
        if (stored && stored.trim()) {
            return stored.trim();
        }
        if (typeof LESOUL_CONFIG !== 'undefined' && LESOUL_CONFIG.APP_BRAND_NAME && LESOUL_CONFIG.APP_BRAND_NAME.trim()) {
            return LESOUL_CONFIG.APP_BRAND_NAME.trim();
        }
        return 'LESOUL';
    }

    function _panel() {
        var panel = _el('div', 'auth-panel');
        var logo = _el('div', 'auth-logo', _getBrandName());
        panel.appendChild(logo);
        return panel;
    }

    function _appendError(panel, message) {
        if (!message) return;
        var err = _el('div', 'auth-error', message);
        panel.appendChild(err);
    }

    function init(options) {
        if (!options || !options.root) {
            throw _makeError('AUTH_UI_ROOT_REQUIRED', 'Auth root element is required');
        }
        _root = options.root;
        _busy = false;
        _clear();
    }

    function showLoading(message) {
        _clear();
        var panel = _panel();
        var loading = _el('div', 'auth-loading', message || '로딩 중...');
        panel.appendChild(loading);
        _root.appendChild(panel);
        showAuth();
    }

    function showSignedOut(handlers) {
        _clear();
        var panel = _panel();

        var title = _el('h2', 'auth-title', '로그인');
        panel.appendChild(title);

        var desc = _el('p', 'auth-description', '이메일과 비밀번호를 입력해 주세요.');
        panel.appendChild(desc);

        var form = document.createElement('form');
        form.className = 'auth-form';

        // Email field
        var emailField = _el('div', 'auth-field');
        emailField.appendChild(_label('auth-email', '이메일'));
        var emailInput = _input('email', 'auth-email', 'auth-input');
        emailInput.required = true;
        emailInput.autocomplete = 'username';
        emailField.appendChild(emailInput);
        form.appendChild(emailField);

        // Password field
        var pwField = _el('div', 'auth-field');
        pwField.appendChild(_label('auth-password', '비밀번호'));
        var pwInput = _input('password', 'auth-password', 'auth-input');
        pwInput.required = true;
        pwInput.autocomplete = 'current-password';
        pwField.appendChild(pwInput);
        form.appendChild(pwField);

        // Error placeholder (if any)
        var errorBox = _el('div', 'auth-error');
        errorBox.style.display = 'none';
        form.appendChild(errorBox);

        // Submit button
        var submitBtn = _button('로그인', 'auth-button', null, 'submit');
        form.appendChild(submitBtn);

        _on(form, 'submit', function (e) {
            e.preventDefault();
            if (_busy) return;
            var email = (emailInput.value || '').trim();
            var password = pwInput.value || '';
            // Reset error
            errorBox.style.display = 'none';
            errorBox.textContent = '';

            // Validation
            if (!email || email.indexOf('@') === -1 || !password) {
                errorBox.textContent = '로그인할 수 없습니다. 이메일과 비밀번호를 확인해 주세요.';
                errorBox.style.display = 'block';
                return;
            }

            // Clear password field immediately after capturing value.
            pwInput.value = '';

            if (handlers && typeof handlers.onSignIn === 'function') {
                handlers.onSignIn({ email: email, password: password });
            }
        });

        panel.appendChild(form);
        _root.appendChild(panel);
        showAuth();
    }

    function showStoreOnboarding(handlers) {
        _clear();
        var panel = _panel();

        var title = _el('h2', 'auth-title', '초기 매장 생성');
        panel.appendChild(title);

        var desc = _el('p', 'auth-description', '첫 매장 정보를 입력해 주세요.');
        panel.appendChild(desc);

        var form = document.createElement('form');
        form.className = 'auth-form';

        // Store name (required)
        var nameField = _el('div', 'auth-field');
        nameField.appendChild(_label('auth-store-name', '매장 이름'));
        var nameInput = _input('text', 'auth-store-name', 'auth-input');
        nameInput.required = true;
        nameInput.maxLength = 100;
        nameField.appendChild(nameInput);
        form.appendChild(nameField);

        // Store subtitle (optional)
        var subField = _el('div', 'auth-field');
        subField.appendChild(_label('auth-store-subtitle', '매장 부제 (선택)'));
        var subInput = _input('text', 'auth-store-subtitle', 'auth-input');
        subField.appendChild(subInput);
        form.appendChild(subField);

        // Default language
        var langField = _el('div', 'auth-field');
        langField.appendChild(_label('auth-default-lang', '기본 언어'));
        var langSelect = document.createElement('select');
        langSelect.id = 'auth-default-lang';
        langSelect.className = 'auth-input';
        var langs = [
            { value: 'ko', label: '한국어' },
            { value: 'zh', label: '中文' },
            { value: 'en', label: 'English' },
            { value: 'ja', label: '日本語' }
        ];
        for (var i = 0; i < langs.length; i++) {
            var opt = document.createElement('option');
            opt.value = langs[i].value;
            opt.textContent = langs[i].label;
            langSelect.appendChild(opt);
        }
        langField.appendChild(langSelect);
        form.appendChild(langField);

        // Error placeholder
        var errorBox = _el('div', 'auth-error');
        errorBox.style.display = 'none';
        form.appendChild(errorBox);

        // Buttons
        var buttonRow = _el('div', 'auth-button-row');
        var createBtn = _button('매장 만들기', 'auth-button', null, 'submit');
        buttonRow.appendChild(createBtn);
        var logoutBtn = _button('로그아웃', 'auth-button-secondary', function () {
            if (_busy) return;
            if (handlers && typeof handlers.onSignOut === 'function') {
                handlers.onSignOut();
            }
        });
        buttonRow.appendChild(logoutBtn);
        form.appendChild(buttonRow);

        _on(form, 'submit', function (e) {
            e.preventDefault();
            if (_busy) return;
            var name = (nameInput.value || '').trim();
            var subtitle = (subInput.value || '').trim();
            var defaultLanguage = langSelect.value || 'ko';

            if (!name || name.length < 1 || name.length > 100) {
                errorBox.textContent = '매장을 만들 수 없습니다.';
                errorBox.style.display = 'block';
                return;
            }

            if (handlers && typeof handlers.onCreateStore === 'function') {
                handlers.onCreateStore({
                    name: name,
                    subtitle: subtitle ? subtitle : null,
                    defaultLanguage: defaultLanguage
                });
            }
        });

        panel.appendChild(form);
        _root.appendChild(panel);
        showAuth();
    }

    function showStoreSelection(memberships, handlers) {
        _clear();
        var panel = _panel();

        var title = _el('h2', 'auth-title', '매장 선택');
        panel.appendChild(title);

        var desc = _el('p', 'auth-description', '진입할 매장을 선택해 주세요.');
        panel.appendChild(desc);

        var list = _el('div', 'auth-store-list');

        var arr = Array.isArray(memberships) ? memberships : [];
        for (var i = 0; i < arr.length; i++) {
            var m = arr[i] || {};
            var option = _el('div', 'auth-store-option');
            option.setAttribute('role', 'button');
            option.setAttribute('tabindex', '0');

            var nameNode = _el('div', 'auth-store-name-text', m.storeName || ('Store #' + (i + 1)));
            option.appendChild(nameNode);

            var roleNode = _el('div', 'auth-store-role-text', m.role || '-');
            option.appendChild(roleNode);

            var storeId = m.storeId;
            _on(option, 'click', function (membership) {
                return function () {
                    if (_busy) return;
                    if (handlers && typeof handlers.onSelectMembership === 'function') {
                        handlers.onSelectMembership(membership);
                    }
                };
            }(arr[i]));

            _on(option, 'keydown', function (membership) {
                return function (ev) {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        if (_busy) return;
                        if (handlers && typeof handlers.onSelectMembership === 'function') {
                            handlers.onSelectMembership(membership);
                        }
                    }
                };
            }(arr[i]));

            list.appendChild(option);
        }

        panel.appendChild(list);

        // Secondary logout button
        var buttonRow = _el('div', 'auth-button-row');
        var logoutBtn = _button('로그아웃', 'auth-button-secondary', function () {
            if (_busy) return;
            if (handlers && typeof handlers.onSignOut === 'function') {
                handlers.onSignOut();
            }
        });
        buttonRow.appendChild(logoutBtn);
        panel.appendChild(buttonRow);

        _root.appendChild(panel);
        showAuth();
    }

    function showError(message, handlers) {
        _clear();
        var panel = _panel();

        var title = _el('h2', 'auth-title', '오류');
        panel.appendChild(title);

        var safeMsg = message || '일시적인 오류가 발생했습니다.';
        _appendError(panel, safeMsg);

        if (handlers && typeof handlers.onRetry === 'function') {
            var buttonRow = _el('div', 'auth-button-row');
            var retryBtn = _button('다시 시도', 'auth-button', function () {
                if (_busy) return;
                handlers.onRetry();
            });
            buttonRow.appendChild(retryBtn);
            panel.appendChild(buttonRow);
        }
        _root.appendChild(panel);
        showAuth();
    }

    function showAppContext(context) {
        var badge = document.getElementById('auth-context-badge');
        var logoutBtn = document.getElementById('auth-logout-button');
        if (badge) {
            var parts = [];
            parts.push('로컬 데이터 모드');
            if (context && context.activeMembership) {
                var m = context.activeMembership;
                if (m.storeName) parts.push(m.storeName);
                if (m.role) parts.push(m.role);
            }
            badge.textContent = parts.join(' · ');
            badge.hidden = false;
        }
        if (logoutBtn) {
            logoutBtn.hidden = false;
        }
    }

    function hideAuth() {
        if (_root) _root.hidden = true;
        var badge = document.getElementById('auth-context-badge');
        var logoutBtn = document.getElementById('auth-logout-button');
        if (badge) badge.hidden = true;
        if (logoutBtn) logoutBtn.hidden = true;
    }

    function showAuth() {
        if (_root) _root.hidden = false;
    }

    function setBusy(isBusy) {
        _busy = !!isBusy;
        // Disable/enable all buttons within auth root.
        if (!_root) return;
        var buttons = _root.querySelectorAll('button');
        for (var i = 0; i < buttons.length; i++) {
            buttons[i].disabled = _busy;
        }
    }

    function destroy() {
        _clear();
        _root = null;
        _busy = false;
    }

    global.LESOULAuthUI = Object.freeze({
        init: init,
        showLoading: showLoading,
        showSignedOut: showSignedOut,
        showStoreOnboarding: showStoreOnboarding,
        showStoreSelection: showStoreSelection,
        showError: showError,
        showAppContext: showAppContext,
        hideAuth: hideAuth,
        showAuth: showAuth,
        setBusy: setBusy,
        destroy: destroy
    });
})(typeof window !== 'undefined' ? window : globalThis);
