# GitHub Support: Cached Sensitive Data Purge Request

## Summary

Requesting removal of cached Git objects and views containing accidentally committed sensitive operational data from the `leolee-007-tj/fashionmanager` repository. The history has been rewritten with `git filter-repo` and force-pushed, but old commit SHAs remain directly accessible via GitHub's cached views and dangling objects.

---

## Support Request Template (copy and paste)

```
Subject: Request to purge cached sensitive data from repository leolee-007-tj/fashionmanager

Hello GitHub Support Team,

I am writing to request the removal of cached Git objects and views containing accidentally committed sensitive data from my public repository.

Repository: leolee-007-tj/fashionmanager
Repository visibility: Public

## What happened

A file containing private operational data was accidentally committed and pushed to the public repository. The file included:
- Customer identifiers
- Product cost and pricing information
- Order and profit information
- Private store operational data

## What we have already done

1. Used `git filter-repo` to remove the sensitive file from all branches and tags
2. Force-pushed the rewritten history to all branches (main, gh-pages, feature/supabase-cloud-migration)
3. Force-pushed all rewritten tags
4. Verified the file no longer exists in the current tree of any branch or tag
5. Added the file path to .gitignore to prevent future occurrences

## File path to remove

- data_export.json

## First Changed Commits (old SHAs containing the data)

<!-- Verified against .git/filter-repo/first-changed-commits on 2026-07-10.
     Both SHAs below are present in the actual git-filter-repo output file.
     These are NOT guessed or inferred from the commit that added the file;
     they are the exact values emitted by git-filter-repo. -->
- 9806e0fd0a4e3a8fab3f552c9776453a1a454052
- 9cf0a0d4be3714a35a0d0a5238a58562b1d1d117

## Affected refs / changed refs

- refs/heads/main
- refs/heads/gh-pages
- refs/heads/feature/supabase-cloud-migration
- refs/tags/backup/pre-supabase-20260710

## Affected Pull Requests

- 0 (no pull requests reference the old commits)

## LFS objects

- None (this repository does not use Git LFS)

## Known forks referencing the old commits

- None identified

## What we are requesting

1. **Cached views / cached commits**: Please clear all cached views and cached commit pages that reference the old SHAs listed above.
2. **Dangling / unreachable objects**: Please run server-side garbage collection to remove the dangling Git objects that are no longer reachable from any ref.
3. **Pull request references**: Please confirm that no pull request references retain the old data (we believe there are none, but please verify).
4. **Search index**: Please also remove related search index entries, if applicable.

## Verification

After processing, we will verify that:
- The sensitive file and blob must no longer be accessible through the old commit SHA. A 404 response is preferred; any remaining commit metadata must not expose the removed file or its contents.
- Direct URL access to the file blob at old commit must not expose the removed file or its contents.
- Cached views must not display the sensitive data.

Please let me know if you need any additional information or if there are any steps I need to take on my end.

Thank you for your assistance.

Best regards,
leolee-007-tj
```

---

## User Submission Procedure

Follow these steps to submit the request to GitHub Support:

### Step 1: Go to GitHub Support Portal
1. Open your browser and go to: https://support.github.com/
2. Click "Contact us" or "Sign in" and log in with your GitHub account (leolee-007-tj)

### Step 2: Create a Support Ticket
1. Under "What can we help you with?", select **"Account security"** or **"General account question"**
2. Or search for "sensitive data removal" or "remove sensitive data from repository"
3. Choose the option for **removing sensitive data from a repository**
4. Select the repository: `leolee-007-tj/fashionmanager`

### Step 3: Paste the Request
1. Copy the English request template from the section above (the text inside the ``` block)
2. Paste it into the support ticket form
3. Fill in any additional required fields

### Step 4: Attach Information (if requested)
- **Do NOT attach** the actual `data_export.json` file
- **Do NOT attach** the full mirror backup file
- **Do NOT paste** any customer names, product costs, or order details
- If they ask for proof, you can reference the commit SHAs listed above
- You can attach a screenshot of the `git log --all -- data_export.json` showing 0 results (after filter-repo)

### Step 5: Submit and Wait
1. Submit the ticket
2. Save the ticket number for your records
3. Wait for a response from GitHub Support

### Step 6: After Support Confirms Processing
Once GitHub Support confirms the data has been purged, verify the following:

The sensitive file and blob must no longer be accessible through the old commit SHA. A 404 response is preferred; any remaining commit metadata must not expose the removed file or its contents.

1. **Old commit page**:
   ```
   https://github.com/leolee-007-tj/fashionmanager/commit/9cf0a0d4be3714a35a0d0a5238a58562b1d1d117
   ```
   Preferably returns 404, or at minimum does not expose the removed file or its contents.

2. **File blob at old commit**:
   ```
   https://github.com/leolee-007-tj/fashionmanager/blob/9cf0a0d4be3714a35a0d0a5238a58562b1d1d117/data_export.json
   ```
   Must not expose the removed file or its contents. A 404 response is preferred.

3. **API access**:
   ```
   https://api.github.com/repos/leolee-007-tj/fashionmanager/git/commits/9cf0a0d4be3714a35a0d0a5238a58562b1d1d117
   ```
   Preferably returns 404, or at minimum does not expose the removed file or its contents.

4. **Cached views**: Verify that no cached view displays the sensitive data.

---

## Important Notes

- **DO NOT** share the actual `data_export.json` file content with anyone
- **DO NOT** upload the mirror backup to GitHub or any public service
- **DO NOT** include real customer names, pricing data, or order details in the support ticket
- The request template above uses only generic category descriptions (not actual data values)
- Keep the mirror backup stored safely offline in case you need reference data later
- If you have any existing clones of the repository on other machines, re-clone them to avoid accidentally re-pushing the old commits
