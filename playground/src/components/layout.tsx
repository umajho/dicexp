import { Component } from "solid-js";
import { Dropdown, DropdownItem } from "./ui/mod";
import {
  HiSolidArrowTopRightOnSquare,
  HiSolidChevronDown,
} from "solid-icons/hi";

import "../styles/preflight";
import "../styles/tailwind";

export const NavBar: Component = () => {
  return (
    <div class="navbar bg-base-100 shadow-xl rounded-box">
      <div class="flex-1 flex items-center">
        <Dropdown
          summary={
            <>
              团岛计划<HiSolidChevronDown size={16} />
            </>
          }
          buttonClass="btn-ghost"
          contentClass="border-[0.5px] border-black"
        >
          <DropdownItem>
            <a href="https://umajho.github.io/rotext">轻量级标记语言 Rotext</a>
          </DropdownItem>
          <DropdownItem>
            <a>骰子表达式 Dicexp（当前）</a>
          </DropdownItem>
        </Dropdown>
        <button
          class="btn btn-ghost normal-case text-xl max-sm:p-0"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <span>
            Dicexp
          </span>
        </button>
      </div>
      <div class="flex-none">
        <ul class="menu menu-horizontal px-1">
          <li>
            <a
              class="inline-flex items-center"
              href="https://github.com/umajho/dicexp"
            >
              代码
              <HiSolidArrowTopRightOnSquare size={16} />
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
};
