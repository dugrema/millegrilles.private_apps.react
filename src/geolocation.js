export async function geolocate() {
    if(!('geolocation' in navigator)) {
        throw new Error("Geolocation non disponible")
    }

    const geolocation = navigator.geolocation
    const resultat = await new Promise((resolve, reject)=>{
        geolocation.getCurrentPosition(resolve, reject, {timeout: 20_000})
    })
    
    console.debug("Resultat geolocation ", resultat)
    return resultat
}
