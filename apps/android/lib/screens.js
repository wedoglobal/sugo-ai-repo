// com.voicemaker.android ekran tanıma ve seçici tablosu. Tüm resource-id'ler burada tek yerde.
var tree = require('./tree');

var ID = {
  popupClose: 'close',
  tabMessages: 'id_main_bottomtab_conv',
  tabHome: 'id_main_bottomtab_home',
  tabMe: 'id_main_bottomtab_me',
  homeNearbyTab: 'id_home_tab_real_nearby',
  nearbyCard: 'layout_nearby_user',
  nearbyName: 'id_user_name_tv',
  nearbyAvatar: 'id_user_avatar_iv',
  nearbyHi: 'id_user_opt_msiv',
  meInfo: 'id_me_userinfo_fl',
  meName: 'txt_tv',
  listTabAll: 'id_conv_tab_all',
  listTabUnread: 'id_conv_tab_unread',
  listTabOnline: 'id_conv_tab_online',
  chatItem: 'll_chat_item',
  itemName: 'id_user_name_tv',
  itemPreview: 'id_latest_msg_tv',
  itemTime: 'id_online_time_tv',
  itemUnreadBadge: 'id_unread_tcv',
  itemOnline: 'id_online_indicator',
  itemAvatar: 'id_user_avatar_iv',
  chatMessages: 'id_msg_list_view',
  chatBack: 'id_back',
  chatTitle: 'id_chatting_title_username_tv',
  chatInput: 'id_input_edit_text',
  chatSend: 'id_chat_send_btn',
  msgText: 'id_chat_msg_text',
  msgState: 'chatting_state_iv',
  sysTip: 'id_chatting_sys_tips_tv',
  card: 'tv_name',
  profileUid: 'uidView',
  profileMarker: 'id_profile_tab_userinfo',
  profileBack: 'backBtn',
  profileHi: 'pickBtn',
  genderBadgeProfile: 'id_gender_age_root',
  settingsMarker: 'll_set_chat_bg'
};

/** Eşleşme önizlemesi; uygulama dili Türkçe/İngilizce için yedekli. */
var MATCH_PREVIEW = /^\[(Eşleşme|Match)\]/i;

/** list | chat | profile | chat-settings | unknown. Ekran dışı ViewPager sayfaları sayılmaz. */
function detect(root, width) {
  // uidView kaydırılmadan ekranın altında kalır (sınırları ters); ekran, her zaman görünen sekme başlığıyla tanınır.
  if (tree.visibleById(root, ID.profileMarker, width)) return 'profile';
  if (tree.visibleById(root, ID.settingsMarker, width)) return 'chat-settings';
  if (tree.visibleById(root, ID.chatMessages, width)) return 'chat';
  if (tree.visibleById(root, ID.listTabAll, width)) return 'list';
  return 'unknown';
}

module.exports = { ID: ID, MATCH_PREVIEW: MATCH_PREVIEW, detect: detect };
