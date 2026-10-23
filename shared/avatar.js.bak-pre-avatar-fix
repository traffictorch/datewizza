/* /shared/avatar.js
   Shared avatar URL resolver for every page that renders a user avatar.
   Exposes window.ttAvatarSrc(obj). Handles:
     1. avatar_url          → use it (prefix API_BASE if relative)
     2. avatar_r2_key only  → rebuild URL from "avatars/<userId>/..."
     3. preset string       → /images/avatars/<preset>.svg
     4. nothing / bad input → owner.svg
*/
(function () {
  if (window.ttAvatarSrc) return;
  var API_BASE = 'https://traffic-torch-auth.traffictorch.workers.dev';
  window.ttAvatarSrc = function (o) {
    if (!o) return '/images/avatars/owner.svg';
    if (typeof o === 'string') {
      if (o.charAt(0) === '/' || o.slice(0, 4) === 'http') return o;
      return '/images/avatars/' + o + '.svg';
    }
    if (o.avatar_url) {
      return o.avatar_url.slice(0, 4) === 'http' ? o.avatar_url : API_BASE + o.avatar_url;
    }
    if (o.avatar_r2_key) {
      var m = String(o.avatar_r2_key).match(/^avatars\/(\d+)\//);
      if (m) return API_BASE + '/api/profile/avatar/' + m[1] + '?v=' + (o.avatar_updated_at || 0);
    }
    return '/images/avatars/' + (o.avatar_preset || 'owner') + '.svg';
  };
})();
