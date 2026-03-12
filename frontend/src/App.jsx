import { useEffect, useState } from "react"

function App() {

  const [message,setMessage] = useState("Loading...")

  useEffect(()=>{
    fetch("http://localhost:5000/api/test")
      .then(res=>res.json())
      .then(data=>setMessage(data.message))
  },[])

  return (

    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center">

      <h1 className="text-4xl font-bold text-cyan-400 mb-6">
        PDF INSIGHTS
      </h1>

      <div className="bg-gray-800 p-6 rounded-xl shadow-xl">

        <p className="text-lg">
          Backend Message:
        </p>

        <p className="text-green-400 text-xl mt-2">
          {message}
        </p>

      </div>

    </div>

  )
}

export default App