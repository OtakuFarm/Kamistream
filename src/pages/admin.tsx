import { useEffect } from 'react';

export default function Admin() {
  useEffect(() => {
    window.location.replace('/admin.html');
  }, []);
  return null;
}
