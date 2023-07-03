import { Component } from "solid-js";

import { NavBar } from "./components/layout";
import { Main } from "./components/main/mod";

const App: Component = () => {
  return (
    <div class="app-container min-h-screen bg-base-300">
      <nav class="absolute z-10 w-full p-2">
        <NavBar />
      </nav>
      <div class="h-32" />
      <Main />
    </div>
  );
};

export default App;
