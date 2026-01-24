// 测试云函数调用
Page({
  onLoad: function () {
    this.testCloudFunction();
  },
  
  testCloudFunction: function () {
    wx.cloud.callFunction({
      name: 'getalldailysentence',
      data: {},
      success: res => {
        console.log('云函数调用成功:', res.result);
        wx.showToast({
          title: '调用成功',
          icon: 'success'
        });
      },
      fail: err => {
        console.error('云函数调用失败:', err);
        wx.showToast({
          title: '调用失败',
          icon: 'error'
        });
      }
    });
  }
});
