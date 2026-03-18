Page({
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }

    const settings = wx.getStorageSync('settings') || {};
    const category = String(settings.category || '');

    const doNavigate = async () => {
      const m = category.match(/^Yonsei\s*(\d)$/i);
      if (!m) {
        wx.showToast({ title: '语法功能正在开发', icon: 'none' });
        wx.switchTab({ url: '/pages/nv-practice/index' });
        return;
      }

      const bookNum = m[1];
      const book = `Yonsei ${bookNum}`;
      let lessonId = String(settings.yonseiLessonId || '').trim();

      if (!lessonId) {
        try {
          const { getYonseiLessons } = require('../../utils_nv/api.js');
          const lessons = await getYonseiLessons(category);
          if (lessons && lessons.length > 0) {
            lessonId = String(lessons[0].id);
          }
        } catch (err) {
          console.error('Auto fetch lesson failed', err);
        }
      }

      if (!lessonId) {
        wx.showToast({ title: '请先在设置中选择课次', icon: 'none' });
        wx.switchTab({ url: '/pages/nv-practice/index' });
        return;
      }

      const url = `/subpackages/grammar/pages/index/index?book=${encodeURIComponent(book)}&lessonId=${encodeURIComponent(lessonId)}`;
      wx.redirectTo({ url });
    };

    doNavigate();
  }
});
