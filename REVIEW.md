# Code Review

## 1. SQL Injection in Task Search

**File:** `backend/projects/views.py`  
**Location:** `TaskListCreateView.get`

### Issue

The search parameter `q` is directly interpolated into the SQL query:

```python
f"AND (title ILIKE '%{q}%' OR description ILIKE '%{q}%') "
```

This means user-controlled input becomes part of the SQL statement instead of being passed as a parameter.

### Impact

**Critical — Security / SQL Injection**

This is a direct SQL injection vulnerability in an authenticated API endpoint. A malicious value supplied through the `q` parameter could potentially alter the SQL query and access unintended database data.

### Suggested Fix

Use Django ORM filtering or parameterized SQL.

For example:

```python
sql = """
    SELECT id, project_id, title, description, status,
           assignee_id, created_by_id, position, created_at, updated_at
    FROM tasks
    WHERE project_id = %s
      AND (title ILIKE %s OR description ILIKE %s)
    ORDER BY position ASC
"""

search = f"%{q}%"

with connection.cursor() as cursor:
    cursor.execute(sql, [project_id, search, search])
```

This ensures that user input is treated as data rather than SQL syntax.

---

## 2. Missing Authorization Check in Task Update

**File:** `backend/projects/views.py`  
**Location:** `TaskDetailView.patch`

### Issue

`TaskDetailView.patch` fetches a task by ID and updates it without checking whether the authenticated user belongs to the task's project or has an appropriate role.

This is especially serious because the delete operation immediately below performs membership control checks, while the PATCH operation is missing the same authorization boundary.

### Impact

**High — Authorization / Access Control**

An authenticated user who knows a task UUID could potentially modify a task belonging to another project.

### Suggested Fix

Load the task together with its project, then call `_get_membership` for the authenticated user and the task's project.

Require an appropriate project role, such as `admin` or `member`, before allowing the update.

The authorization flow should be:

1. Load the task and its associated project.
2. Call `_get_membership(request.user, task.project_id)`.
3. Require `admin` or `member` access.
4. Only then perform the requested task update.
5. Return `403 Forbidden` when the user does not have the required membership or role.

### Why

Task updates must be protected by the same project-level authorization boundary as other task operations. Otherwise, knowing a task UUID may be sufficient to modify another project's task.

---

## 3. Assignee Is Not Validated Against Project Membership

**File:** `backend/projects/views.py`  
**Location:** Lines 151–159, `TaskListCreateView.post`

### Issue

Task creation accepts `assigneeId` directly from the request:

```python
assignee_id=request.data.get('assigneeId') or None,
```

There is no validation that the selected user is actually a member of the project.

A task in Project A can therefore potentially be assigned to a user who has no relationship with Project A.

### Impact

**Medium — Data Integrity / Authorization**

This can create invalid cross-project task assignments and violates the project's membership boundary.

### Suggested Fix

Validate `assigneeId` against the project's membership before creating the task:

```python
Membership.objects.filter(
    project_id=project_id,
    user_id=assignee_id,
).exists()
```

If the assignee is not a member of the project, reject the request instead of creating the task.

### Why

Task assignments should be restricted to users who belong to the project. Validating the assignee against `Membership` prevents cross-project assignments and keeps task data consistent.

---

## 4. Weak Django Secret Fallback and Excessively Long JWT Lifetime

**File:** `backend/taskboard/settings.py`  
**Location:** Lines 7 and 51–54

### Issue

The application falls back to a known development Django secret key:

```python
SECRET_KEY = os.environ.get(
    'DJANGO_SECRET_KEY',
    'dev-secret-change-me-in-production'
)
```

The JWT access token lifetime is also configured for 30 days:

```python
'ACCESS_TOKEN_LIFETIME': timedelta(days=30),
```

During the test run, the JWT library also reported that the configured HMAC key is only 25 bytes, below the recommended 32-byte key length for HS256.

### Impact

**High — Security / Authentication**

A predictable fallback secret weakens cryptographic security if it is used outside development.

A 30-day access token also increases the period during which a compromised token can be used.

### Suggested Fix

Require a strong secret from the environment in non-development deployments and enforce an adequately long key.

Use a much shorter access-token lifetime and rely on refresh tokens for longer-lived sessions.

For example:

```python
SECRET_KEY = os.environ['DJANGO_SECRET_KEY']

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=15),
    'AUTH_HEADER_TYPES': ('Bearer',),
}
```

### Why

A strong, externally supplied secret prevents predictable cryptographic keys from being used. Short-lived access tokens reduce the impact of token compromise, while refresh tokens can provide longer-lived sessions when required.
