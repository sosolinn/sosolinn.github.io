function addRecord(){

    let sample =
    document.getElementById("sample").value;


    let date =
    document.getElementById("date").value;


    let note =
    document.getElementById("note").value;


    let li=document.createElement("li");


    li.innerHTML=
    `
    样本：
    ${sample}
    <br>
    日期：
    ${date}
    <br>
    备注：
    ${note}
    `;


    document
    .getElementById("list")
    .appendChild(li);

}