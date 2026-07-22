const form = document.getElementById('post-form');
const titleInput = document.getElementById('title');
const dateInput = document.getElementById('date');
const tagsInput = document.getElementById('tags');
const bodyInput = document.getElementById('body');
const formHeading = document.getElementById('form-heading');
const submitBtn = document.getElementById('submit-btn');
const cancelBtn = document.getElementById('cancel-btn');
const formStatus = document.getElementById('form-status');
const postList = document.getElementById('post-list');
const emptyState = document.getElementById('admin-empty');

let editingFilename = null;

function setStatus(message, isError) {
  formStatus.textContent = message || '';
  formStatus.classList.toggle('error', Boolean(isError));
}

function resetForm() {
  editingFilename = null;
  form.reset();
  formHeading.textContent = '새 글 작성';
  submitBtn.textContent = '저장';
  cancelBtn.hidden = true;
  setStatus('');
}

function enterEditMode(post) {
  editingFilename = post.filename;
  titleInput.value = post.title;
  dateInput.value = post.date;
  tagsInput.value = post.tags.join(', ');
  bodyInput.value = post.body;
  formHeading.textContent = `수정: ${post.title}`;
  submitBtn.textContent = '수정 저장';
  cancelBtn.hidden = false;
  setStatus('');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadPosts() {
  const res = await fetch('/api/posts');
  const posts = await res.json();

  postList.innerHTML = '';
  emptyState.hidden = posts.length > 0;

  for (const post of posts) {
    const li = document.createElement('li');
    li.className = 'admin-post-item';

    const info = document.createElement('div');
    info.className = 'admin-post-info';
    const titleEl = document.createElement('div');
    titleEl.className = 'admin-post-title';
    titleEl.textContent = post.title;
    const metaEl = document.createElement('div');
    metaEl.className = 'admin-post-meta';
    metaEl.textContent = [post.date, post.tags.join(', ')].filter(Boolean).join(' · ');
    info.append(titleEl, metaEl);

    const buttons = document.createElement('div');
    buttons.className = 'admin-post-buttons';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'admin-btn';
    editBtn.textContent = '수정';
    editBtn.addEventListener('click', async () => {
      const detailRes = await fetch(`/api/posts/${encodeURIComponent(post.filename)}`);
      if (!detailRes.ok) return;
      enterEditMode(await detailRes.json());
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'admin-btn';
    deleteBtn.textContent = '삭제';
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`"${post.title}" 글을 삭제할까요?`)) return;
      const delRes = await fetch(`/api/posts/${encodeURIComponent(post.filename)}`, { method: 'DELETE' });
      if (delRes.ok) {
        if (editingFilename === post.filename) resetForm();
        loadPosts();
      }
    });

    buttons.append(editBtn, deleteBtn);
    li.append(info, buttons);
    postList.appendChild(li);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const payload = {
    title: titleInput.value.trim(),
    date: dateInput.value,
    tags: tagsInput.value.split(',').map((t) => t.trim()).filter(Boolean),
    body: bodyInput.value,
  };

  const url = editingFilename ? `/api/posts/${encodeURIComponent(editingFilename)}` : '/api/posts';
  const method = editingFilename ? 'PUT' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const result = await res.json();
  if (!res.ok) {
    setStatus(result.error || '저장에 실패했습니다.', true);
    return;
  }

  setStatus('저장했습니다.');
  resetForm();
  loadPosts();
});

cancelBtn.addEventListener('click', resetForm);

loadPosts();
