(function () {
  var searchInput = document.getElementById('search-input');
  var tagFilters = document.getElementById('tag-filters');
  var postList = document.getElementById('post-list');
  var emptyState = document.getElementById('empty-state');
  if (!postList) return;

  var cards = Array.prototype.slice.call(postList.querySelectorAll('.post-card'));
  var recordsBySlug = {};
  var activeTag = 'all';

  fetch('search-index.json')
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      data.forEach(function (record) {
        recordsBySlug[record.slug] = record;
      });
      applyFilters();
    })
    .catch(function (err) {
      console.error('검색 인덱스를 불러오지 못했습니다.', err);
    });

  function applyFilters() {
    var query = (searchInput && searchInput.value.trim().toLowerCase()) || '';
    var visibleCount = 0;

    cards.forEach(function (card) {
      var slug = card.dataset.slug;
      var tags = (card.dataset.tags || '').split(',').filter(Boolean);
      var record = recordsBySlug[slug];

      var matchesTag = activeTag === 'all' || tags.indexOf(activeTag) !== -1;
      var matchesQuery =
        query === '' ||
        (record &&
          (record.title.toLowerCase().indexOf(query) !== -1 ||
            record.content.toLowerCase().indexOf(query) !== -1));

      var visible = matchesTag && matchesQuery;
      card.classList.toggle('hidden', !visible);
      if (visible) visibleCount++;
    });

    if (emptyState) {
      emptyState.hidden = visibleCount !== 0;
    }
  }

  if (searchInput) {
    searchInput.addEventListener('input', applyFilters);
  }

  if (tagFilters) {
    tagFilters.addEventListener('click', function (event) {
      var btn = event.target.closest('.tag-btn');
      if (!btn) return;
      activeTag = btn.dataset.tag;
      Array.prototype.slice
        .call(tagFilters.querySelectorAll('.tag-btn'))
        .forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
      applyFilters();
    });
  }
})();
