export const geocodeLocation = async (locationName) => {
  if (!locationName) return null;
  
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationName)}&format=json&limit=1&countrycodes=il`,
      { headers: { 'Accept-Language': 'he', 'User-Agent': 'joBoss-app' } }
    );
    const data = await response.json();
    
    if (data && data.length > 0) {
      return {
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon),
        displayName: data[0].display_name
      };
    }
    return null;
  } catch (error) {
    console.error('שגיאה בתרגום מיקום:', error);
    return null;
  }
};