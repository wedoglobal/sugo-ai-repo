-- Eklentinin panelden bağımsız olarak profil durumunu okuduğu son an; panel "eşitlendi" bilgisini buradan gösterir.
alter table hosts add column if not exists last_seen_at timestamptz;
