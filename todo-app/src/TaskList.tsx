import React from 'react';

function TaskList({ tasks }: { tasks: string[] }) {
  return (
    <ul>
      {tasks.map((task, index) => (
        <li key={index}>{task}</li>
      ))}
    </ul>
  );
}

export default TaskList;
